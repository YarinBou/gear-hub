import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { defaultStatus } from "@/lib/kit";

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
    copyFrom?: Map<string, Map<string, { present: boolean; quantity: number | null }>>;
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
          ...(prev ? { present: prev.present, quantity: prev.quantity } : defaultStatus(def, startPresent)),
        };
      }),
    ),
    skipDuplicates: true,
  });
}
