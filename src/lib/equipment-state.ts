import type { Prisma } from "@/generated/prisma/client";
import type { EquipmentStatus, Platoon } from "@/generated/prisma/enums";

// Reading an item's state (holder / status / platoon / last verified) in one deployment.
// The state lives in EquipmentAssignment; these helpers let queries select it and hand pages the
// same flat shape items used to have. With no deployment, every item reads as "in the armory".
//
// Nested relation filters are not rewritten by scopedDb, so the deploymentId is always explicit here.

/** Matches no assignment row — used when there is no deployment. */
const NONE = "__no_deployment__";

/** Matches no item at all. */
export const NO_ITEMS: Prisma.EquipmentItemWhereInput = { id: { in: [] } };

/** `select`/`include` fragment: the item's state row in this deployment (at most one). */
export function stateSelect<S extends Prisma.SoldierSelect>(deploymentId: string | null, soldier: S) {
  return {
    assignments: {
      where: { deploymentId: deploymentId ?? NONE },
      take: 1,
      select: { status: true, platoon: true, lastVerifiedAt: true, soldierId: true, soldier: { select: soldier } },
    },
  } as const;
}

type StateRow<S> = {
  status: EquipmentStatus;
  platoon: Platoon | null;
  lastVerifiedAt: Date | null;
  soldierId: string | null;
  soldier: S | null;
};

export type FlatState<S> = {
  status: EquipmentStatus;
  platoon: Platoon | null;
  lastVerifiedAt: Date | null;
  assignedSoldierId: string | null;
  assignedSoldier: S | null;
};

/** The selected soldier shape of an item's state row. */
type SoldierOf<T> = T extends { assignments: { soldier: infer S }[] } ? NonNullable<S> : never;

/** Replace `assignments` with flat state fields (defaults when the item has no row). */
export function flattenState<T extends { assignments: StateRow<unknown>[] }>(
  item: T,
): Omit<T, "assignments"> & FlatState<SoldierOf<T>> {
  const { assignments, ...rest } = item;
  const a = assignments[0];
  return {
    ...rest,
    status: a?.status ?? "IN_ARMORY",
    platoon: a?.platoon ?? null,
    lastVerifiedAt: a?.lastVerifiedAt ?? null,
    assignedSoldierId: a?.soldierId ?? null,
    assignedSoldier: (a?.soldier ?? null) as SoldierOf<T> | null,
  };
}

/** Item filter: its state in this deployment matches `where`. */
export function inState(deploymentId: string, where: Prisma.EquipmentAssignmentWhereInput): Prisma.EquipmentItemWhereInput {
  return { assignments: { some: { deploymentId, ...where } } };
}
