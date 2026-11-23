import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { defaultStatus, expectedOf, haveOf } from "@/lib/kit";

// Creating checklist rows (KitItemStatus) for kits. Used when a deployment starts, when a kit row
// is created lazily, and when an admin adds a checklist item mid-deployment.
// Takes a company-scoped client; rows carry the companyId explicitly.

type Tx = Prisma.TransactionClient;

const defSelect = { id: true, targetQuantity: true, startPresent: true } as const;

/** The company's active checklist items, in order. */
export function activeItemDefs(tx: Tx) {
  return tx.kitItemDef.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true, groupName: true, sortOrder: true, targetQuantity: true, systemKey: true, optional: true },
  });
}

/**
 * Give kits a row for each active checklist item they don't have yet. New rows start per the
 * item's start setting, or from `copyFrom` (the same kit's row in the previous deployment).
 */
export async function createKitStatuses(
  tx: Tx,
  opts: {
    companyId: string;
    kitIds: string[];
    /** Previous deployment's state, by new kit id → item id. */
    copyFrom?: Map<string, Map<string, { present: boolean; quantity: number | null; baseline: number | null }>>;
  },
) {
  if (!opts.kitIds.length) return;
  const defs = await tx.kitItemDef.findMany({ where: { isActive: true }, select: defSelect });
  if (!defs.length) return;
  await tx.kitItemStatus.createMany({
    data: opts.kitIds.flatMap((kitId) =>
      defs.map((def) => {
        const prev = opts.copyFrom?.get(kitId)?.get(def.id);
        return {
          companyId: opts.companyId,
          kitId,
          itemId: def.id,
          ...(prev ? { present: prev.present, quantity: prev.quantity, baseline: prev.baseline } : defaultStatus(def)),
        };
      }),
    ),
    skipDuplicates: true,
  });
}

/**
 * A kit that hasn't been issued yet in the active deployment: no soldier, no weapon, not signed,
 * never returned. Its checklist is just the starting point, so it follows the start settings.
 * A returned kit (זיכוי) holds what actually came back, so the start settings never overwrite it.
 */
export const unissuedKitWhere = {
  deployment: { status: "ACTIVE" },
  soldierId: null,
  personalWeaponId: null,
  signedAt: null,
  returns: { none: {} },
} satisfies Prisma.PersonalKitWhereInput;

/**
 * Re-apply the start settings to the unissued kits of the active deployment (all items, or just
 * `itemIds`). Issued kits and closed deployments aren't touched. Returns how many kits changed.
 */
export async function applyStartToUnissuedKits(tx: Tx, itemIds?: string[]) {
  const defs = await tx.kitItemDef.findMany({
    where: { isActive: true, ...(itemIds ? { id: { in: itemIds } } : {}) },
    select: defSelect,
  });
  const kits = new Set<string>();
  for (const def of defs) {
    const start = defaultStatus(def);
    const rows = await tx.kitItemStatus.findMany({
      where: {
        itemId: def.id,
        kit: unissuedKitWhere,
        NOT: { present: start.present, quantity: start.quantity },
      },
      select: { id: true, kitId: true },
    });
    if (!rows.length) continue;
    await tx.kitItemStatus.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { ...start, baseline: null } });
    rows.forEach((r) => kits.add(r.kitId));
  }
  return kits.size;
}

/** Write per-row values with as few updates as possible (rows grouped by value). */
async function writeGrouped(tx: Tx, rows: { id: string; value: number }[], field: "baseline" | "quantity") {
  const byValue = new Map<number, string[]>();
  for (const r of rows) byValue.set(r.value, [...(byValue.get(r.value) ?? []), r.id]);
  for (const [value, ids] of byValue) {
    await tx.kitItemStatus.updateMany({ where: { id: { in: ids } }, data: { [field]: value } });
  }
}

const rowSelect = {
  id: true,
  itemId: true,
  present: true,
  quantity: true,
  baseline: true,
  item: { select: { targetQuantity: true, optional: true } },
} as const;

/** How many of each item the kit's פק"ל requires (by item id). */
async function pakalRequirements(tx: Tx, kitId: string) {
  const kit = await tx.personalKit.findUnique({
    where: { id: kitId },
    select: { pakal: { select: { items: { select: { itemId: true, quantity: true } } } } },
  });
  return new Map(kit?.pakal?.items.map((i) => [i.itemId, i.quantity]) ?? []);
}

/**
 * Signing: what is marked on the kit right now becomes what the soldier signed for (baseline).
 * From then on, only what they signed for (and what the kit's פק"ל requires) can be missing.
 */
export async function captureBaseline(tx: Tx, kitId: string) {
  const rows = await tx.kitItemStatus.findMany({ where: { kitId }, select: rowSelect });
  await writeGrouped(tx, rows.map((r) => ({ id: r.id, value: haveOf({ ...r, targetQuantity: r.item.targetQuantity }) })), "baseline");
}

/** "הכל קיים": every line that is part of this kit gets what it should have. */
export async function fillKit(tx: Tx, kitId: string) {
  const [rows, required] = await Promise.all([
    tx.kitItemStatus.findMany({ where: { kitId, item: { isActive: true } }, select: rowSelect }),
    pakalRequirements(tx, kitId),
  ]);
  const lines = rows.map((r) => ({
    ...r,
    targetQuantity: r.item.targetQuantity,
    expected: expectedOf({
      targetQuantity: r.item.targetQuantity,
      baseline: r.baseline,
      optional: r.item.optional,
      pakalQuantity: required.get(r.itemId) ?? null,
    }),
  }));
  const plain = lines.filter((l) => l.targetQuantity == null && l.expected != null && !l.present).map((l) => l.id);
  if (plain.length) await tx.kitItemStatus.updateMany({ where: { id: { in: plain } }, data: { present: true } });
  await writeGrouped(
    tx,
    lines
      .filter((l) => l.targetQuantity != null && l.expected != null && l.quantity !== l.expected)
      .map((l) => ({ id: l.id, value: l.expected! })),
    "quantity",
  );
}
