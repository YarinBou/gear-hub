import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { EquipmentStatus } from "@/generated/prisma/enums";
import { createKitStatuses } from "@/lib/kit-service";

// Starting and closing deployments (הפעלות). Runs with a client scoped to the company but NOT to a
// deployment (scopedDb(companyId)), because it reads one deployment and writes another.
//
// A company has at most one ACTIVE deployment. Starting a new one closes the current one.
// The new deployment starts either
//   - "copy" (default): from the previous deployment (the active one, else the latest closed):
//     who holds which item, kit holders + their checklist + weapon, and ammo quantities
//     (as an opening count). Signatures are NOT copied — soldiers sign again for a new deployment.
//     Soldiers who have since left the roster are dropped (their items return to the armory).
//     Who was marked as not participating stays that way.
//   - "empty": everyone on the roster participates, nobody holds anything, kits are blank (checklist per the company's "new kits start
//     full / empty" setting), no ammo. Physical conditions that outlive a
//     deployment are kept: items that are missing / in repair / stored stay that way.

type Tx = Prisma.TransactionClient;

export type StartMode = "copy" | "empty";

export class DeploymentError extends Error {}

/** Conditions of the item itself, kept even when starting empty. */
const PHYSICAL_STATUSES: EquipmentStatus[] = ["MISSING", "IN_REPAIR", "STORED"];

export async function closeDeployment(tx: Tx, deploymentId: string) {
  const { count } = await tx.deployment.updateMany({
    where: { id: deploymentId, status: "ACTIVE" },
    data: { status: "CLOSED", activeCompanyId: null, endedAt: new Date() },
  });
  if (!count) throw new DeploymentError("ההפעלה כבר הסתיימה");
}

export async function startDeployment(
  tx: Tx,
  opts: { companyId: string; name: string; mode: StartMode; userId: string },
) {
  const { companyId, name, mode, userId } = opts;
  if (await tx.deployment.findFirst({ where: { name }, select: { id: true } })) {
    throw new DeploymentError("כבר קיימת הפעלה בשם זה");
  }

  const active = await tx.deployment.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
  const previous =
    active ??
    (await tx.deployment.findFirst({
      where: { status: "CLOSED" },
      orderBy: [{ endedAt: "desc" }, { startedAt: "desc" }],
      select: { id: true, name: true },
    }));
  if (active) await closeDeployment(tx, active.id);

  const deployment = await tx.deployment.create({
    data: { companyId, name, status: "ACTIVE", activeCompanyId: companyId, createdById: userId },
    select: { id: true, name: true },
  });
  const copy = mode === "copy" && previous ? previous : null;

  const activeSoldiers = new Set(
    (await tx.soldier.findMany({ where: { isActive: true }, select: { id: true } })).map((s) => s.id),
  );
  const keepSoldier = (id: string | null) => (id && activeSoldiers.has(id) ? id : null);

  // ── Equipment: one state row per item ──
  const items = await tx.equipmentItem.findMany({ select: { id: true } });
  const prevRows = previous
    ? await tx.equipmentAssignment.findMany({
        where: { deploymentId: previous.id },
        select: { itemId: true, soldierId: true, status: true, platoonId: true, lastVerifiedAt: true },
      })
    : [];
  const prevByItem = new Map(prevRows.map((r) => [r.itemId, r]));
  await tx.equipmentAssignment.createMany({
    data: items.map(({ id: itemId }) => {
      const prev = prevByItem.get(itemId);
      const base = { companyId, deploymentId: deployment.id, itemId };
      if (copy && prev) {
        const soldierId = keepSoldier(prev.soldierId);
        const status: EquipmentStatus = !soldierId && prev.status === "WITH_SOLDIER" ? "IN_ARMORY" : prev.status;
        return { ...base, soldierId, status, platoonId: prev.platoonId, lastVerifiedAt: prev.lastVerifiedAt };
      }
      const status: EquipmentStatus = prev && PHYSICAL_STATUSES.includes(prev.status) ? prev.status : "IN_ARMORY";
      return { ...base, status };
    }),
  });

  // ── Who is not in it: "copy" carries over who wasn't in the previous one (still on the roster) ──
  if (copy) {
    const absent = await tx.deploymentAbsence.findMany({ where: { deploymentId: copy.id }, select: { soldierId: true } });
    const keep = absent.filter((a) => activeSoldiers.has(a.soldierId));
    if (keep.length) {
      await tx.deploymentAbsence.createMany({
        data: keep.map((a) => ({ companyId, deploymentId: deployment.id, soldierId: a.soldierId })),
      });
    }
  }

  // ── Personal kits 1..kitCount ──
  const { kitCount } = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { kitCount: true } });
  const prevKits = copy
    ? await tx.personalKit.findMany({
        where: { deploymentId: copy.id },
        select: {
          kitNumber: true,
          soldierId: true,
          personalWeaponId: true,
          rifleType: true,
          magazineCount: true,
          ammoCount: true,
          notes: true,
          items: { select: { itemId: true, present: true, quantity: true } },
        },
      })
    : [];
  const kitByNumber = new Map(prevKits.map((k) => [k.kitNumber, k]));
  // Kits that carry over to the same soldier keep their checklist (by kit number).
  const carried = new Map<number, (typeof prevKits)[number]>();
  const newKits = await tx.personalKit.createManyAndReturn({
    data: Array.from({ length: kitCount }, (_, i) => {
      const kitNumber = i + 1;
      const base = { companyId, deploymentId: deployment.id, kitNumber };
      const prev = kitByNumber.get(kitNumber);
      if (!prev) return base;
      const soldierId = keepSoldier(prev.soldierId);
      if (!soldierId) return base; // the holder left — the kit starts blank
      carried.set(kitNumber, prev);
      const { kitNumber: _n, soldierId: _s, items: _i, ...rest } = prev;
      return { ...base, ...rest, soldierId };
    }),
    select: { id: true, kitNumber: true },
  });
  // Checklist rows: carried kits copy theirs; the rest start per the company setting.
  const copyFrom = new Map(
    newKits.flatMap((k) => {
      const prev = carried.get(k.kitNumber);
      return prev ? [[k.id, new Map(prev.items.map((s) => [s.itemId, s]))] as const] : [];
    }),
  );
  await createKitStatuses(tx, { companyId, kitIds: newKits.map((k) => k.id), copyFrom });

  // ── Ammo: opening balance from the previous deployment ──
  if (copy) {
    const stocks = await tx.ammoStock.findMany({
      where: { deploymentId: copy.id },
      select: { categoryId: true, location: true, quantity: true, lastCountedAt: true, notes: true },
    });
    for (const s of stocks) {
      const stock = await tx.ammoStock.create({
        data: { companyId, deploymentId: deployment.id, ...s },
        select: { id: true },
      });
      await tx.ammoLog.create({
        data: {
          companyId,
          stockId: stock.id,
          type: "COUNT",
          amount: s.quantity,
          previousQuantity: 0,
          newQuantity: s.quantity,
          note: `יתרת פתיחה מ"${copy.name}"`,
          performedById: userId,
        },
      });
    }
  }

  return { deployment, closed: active, copiedFrom: copy };
}
