import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { defaultStatus, expectedOf, haveOf } from "@/lib/kit";

// Creating checklist rows (KitItemStatus) for kits. Used when a deployment starts, when a kit row
// is created lazily, and when an admin adds a checklist item mid-deployment.
// Takes a company-scoped client; rows carry the companyId explicitly.

type Tx = Prisma.TransactionClient;

const defSelect = { id: true, targetQuantity: true } as const;

/** The company's active checklist items, in order. */
export function activeItemDefs(tx: Tx) {
  return tx.kitItemDef.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true, groupName: true, sortOrder: true, targetQuantity: true, systemKey: true },
  });
}

/** Whether new kits start with every item present (company setting). */
export async function kitsStartPresent(tx: Tx, companyId: string) {
  const c = await tx.company.findUnique({ where: { id: companyId }, select: { kitDefaultPresent: true } });
  return c?.kitDefaultPresent ?? false;
}

/**
 * Give kits a row for each active checklist item they don't have yet. New rows start per the
 * company setting, or from `copyFrom` (the same kit's row in the previous deployment).
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
  const [defs, startPresent] = await Promise.all([
    tx.kitItemDef.findMany({ where: { isActive: true }, select: defSelect }),
    kitsStartPresent(tx, opts.companyId),
  ]);
  if (!defs.length) return;
  await tx.kitItemStatus.createMany({
    data: opts.kitIds.flatMap((kitId) =>
      defs.map((def) => {
        const prev = opts.copyFrom?.get(kitId)?.get(def.id);
        return {
          companyId: opts.companyId,
          kitId,
          itemId: def.id,
          ...(prev ? { present: prev.present, quantity: prev.quantity, baseline: prev.baseline } : defaultStatus(def, startPresent)),
        };
      }),
    ),
    skipDuplicates: true,
  });
}

/** Write per-row values with as few updates as possible (rows grouped by value). */
async function writeGrouped(tx: Tx, rows: { id: string; value: number }[], field: "baseline" | "quantity") {
  const byValue = new Map<number, string[]>();
  for (const r of rows) byValue.set(r.value, [...(byValue.get(r.value) ?? []), r.id]);
  for (const [value, ids] of byValue) {
    await tx.kitItemStatus.updateMany({ where: { id: { in: ids } }, data: { [field]: value } });
  }
}

const rowSelect = { id: true, present: true, quantity: true, baseline: true, item: { select: { targetQuantity: true } } } as const;

/**
 * Signing: what is marked on the kit right now becomes what the soldier signed for (baseline).
 * From then on, only what they signed for can be missing.
 */
export async function captureBaseline(tx: Tx, kitId: string) {
  const rows = await tx.kitItemStatus.findMany({ where: { kitId }, select: rowSelect });
  await writeGrouped(tx, rows.map((r) => ({ id: r.id, value: haveOf({ ...r, targetQuantity: r.item.targetQuantity }) })), "baseline");
}

/** "הכל קיים": every line that is part of this kit gets what it should have. */
export async function fillKit(tx: Tx, kitId: string) {
  const rows = await tx.kitItemStatus.findMany({ where: { kitId, item: { isActive: true } }, select: rowSelect });
  const lines = rows.map((r) => ({
    ...r,
    targetQuantity: r.item.targetQuantity,
    expected: expectedOf({ targetQuantity: r.item.targetQuantity, baseline: r.baseline }),
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
