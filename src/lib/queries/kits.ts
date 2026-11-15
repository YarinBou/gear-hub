import "server-only";
import { connection } from "next/server";
import { companyContext } from "@/lib/context";
import { flattenState, inState, stateSelect } from "@/lib/equipment-state";
import { checklistLines, kitItemsSelect, kitReadiness, missingDescriptions, type ChecklistLine } from "@/lib/kit";
import { activeItemDefs } from "@/lib/kit-service";
import { platoonSelect, type PlatoonRef } from "@/lib/platoons";

export type KitTile = {
  kitNumber: number;
  soldier: { id: string; name: string; platoon: PlatoonRef } | null;
  readiness: number;
  /** Incomplete checklist lines ("קסדה", "מחסניות (5/7)"). */
  missing: string[];
  signedAt: Date | null;
  lastInspectedAt: Date | null;
};

/** All kit slots of the viewed deployment, including kits whose DB row doesn't exist yet. */
export async function listKits(): Promise<KitTile[]> {
  await connection();
  const { db, deployment } = await companyContext();
  const [kits, activeDefs] = await Promise.all([
    db.personalKit.findMany({
      select: {
        kitNumber: true,
        signedAt: true,
        lastInspectedAt: true,
        soldier: { select: { id: true, name: true, platoon: platoonSelect } },
        ...kitItemsSelect,
      },
    }),
    activeItemDefs(db),
  ]);
  const history = !!deployment?.readOnly;
  const byNumber = new Map(kits.map((k) => [k.kitNumber, k]));
  const slots = await getKitSlots();
  return Array.from({ length: slots }, (_, i) => {
    const k = byNumber.get(i + 1);
    const lines = k ? checklistLines(k.items, { history, activeDefs }) : [];
    return {
      kitNumber: i + 1,
      soldier: k?.soldier ?? null,
      readiness: k ? kitReadiness(lines) : 0,
      missing: missingDescriptions(lines),
      signedAt: k?.signedAt ?? null,
      lastInspectedAt: k?.lastInspectedAt ?? null,
    };
  });
}

export async function getKit(kitNumber: number) {
  const { db, deployment } = await companyContext();
  const activeDefs = await activeItemDefs(db);
  // Kit numbers repeat across companies and deployments; the scoped client limits this to the
  // user's company and the viewed deployment.
  const kit = await db.personalKit.findFirst({
    where: { kitNumber },
    include: {
      soldier: { select: { id: true, name: true, platoon: platoonSelect, personalNumber: true, phone: true } },
      personalWeapon: {
        select: {
          id: true,
          serialNumber: true,
          category: { select: { name: true } },
          ...stateSelect(deployment?.id ?? null, { id: true }),
        },
      },
      signedBy: { select: { name: true } },
      ...kitItemsSelect,
      inspections: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { performedBy: { select: { name: true } } },
      },
    },
  });
  if (!kit) return null;
  const { items, ...rest } = kit;
  // Live deployment: the company's current checklist. Closed one: exactly what was recorded.
  const lines: ChecklistLine[] = checklistLines(items, { history: !!deployment?.readOnly, activeDefs });
  return { ...rest, lines, personalWeapon: kit.personalWeapon ? flattenState(kit.personalWeapon) : null };
}

export type KitDetail = NonNullable<Awaited<ReturnType<typeof getKit>>>;

/** Previous / next *issued* kit numbers, for walking through a מסדר. */
export async function getKitNeighbours(kitNumber: number, platoonId?: string) {
  const { db } = await companyContext();
  const where = { soldierId: { not: null }, ...(platoonId ? { soldier: { platoonId } } : {}) };
  const [prev, next] = await Promise.all([
    db.personalKit.findFirst({
      where: { ...where, kitNumber: { lt: kitNumber } },
      orderBy: { kitNumber: "desc" },
      select: { kitNumber: true },
    }),
    db.personalKit.findFirst({
      where: { ...where, kitNumber: { gt: kitNumber } },
      orderBy: { kitNumber: "asc" },
      select: { kitNumber: true },
    }),
  ]);
  return { prev: prev?.kitNumber ?? null, next: next?.kitNumber ?? null };
}

/** Soldier ids that already hold a kit (other than `exceptKit`). */
export async function getSoldiersWithKit(exceptKit?: number) {
  const { db } = await companyContext();
  const rows = await db.personalKit.findMany({
    where: { soldierId: { not: null }, ...(exceptKit ? { kitNumber: { not: exceptKit } } : {}) },
    select: { soldierId: true, kitNumber: true },
  });
  return new Map(rows.map((r) => [r.soldierId!, r.kitNumber]));
}

/**
 * Serial-numbered items that can be this kit's personal weapon:
 * items already held by the soldier, plus unassigned items sitting in the armory.
 * Items linked to another kit are excluded.
 */
export async function getWeaponOptions(soldierId: string | null, currentWeaponId: string | null) {
  const { db, deployment } = await companyContext();
  if (!deployment) return [];
  const deploymentId = deployment.id;
  const items = await db.equipmentItem.findMany({
    where: {
      OR: [
        ...(soldierId ? [inState(deploymentId, { soldierId })] : []),
        inState(deploymentId, { soldierId: null, status: "IN_ARMORY" }),
        ...(currentWeaponId ? [{ id: currentWeaponId }] : []),
      ],
      AND: [
        // Not already another kit's weapon in this deployment.
        {
          OR: [
            { personalKits: { none: { deploymentId } } },
            ...(currentWeaponId ? [{ id: currentWeaponId }] : []),
          ],
        },
        // Components of a set (e.g. a sight attached to a Negev) can't be a kit's personal weapon.
        { parentId: null },
      ],
    },
    orderBy: [{ category: { name: "asc" } }, { serialNumber: "asc" }],
    take: 300,
    select: { id: true, serialNumber: true, category: { select: { name: true } }, ...stateSelect(deploymentId, { id: true }) },
  });
  return items.map(flattenState).map((i) => ({
    id: i.id,
    serialNumber: i.serialNumber,
    category: i.category.name,
    heldBySoldier: !!soldierId && i.assignedSoldierId === soldierId,
  }));
}

export type WeaponOption = Awaited<ReturnType<typeof getWeaponOptions>>[number];

/**
 * How many kit slots the viewed deployment has: the company's kit count — or, for a closed
 * deployment, as many as it had (the count may have changed since).
 */
export async function getKitSlots() {
  const { user, db, deployment } = await companyContext();
  const company = await db.company.findUnique({ where: { id: user.companyId }, select: { kitCount: true } });
  const count = company?.kitCount ?? 0;
  if (!deployment?.readOnly) return count;
  const last = await db.personalKit.findFirst({ orderBy: { kitNumber: "desc" }, select: { kitNumber: true } });
  return last?.kitNumber ?? count;
}
