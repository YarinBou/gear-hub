import "server-only";
import { connection } from "next/server";
import { companyContext } from "@/lib/context";
import { inState } from "@/lib/equipment-state";
import type { Prisma } from "@/generated/prisma/client";

// Equipment sets (מארזים) — see src/lib/equipment-sets.ts for the rules.

export const slotSelect = {
  orderBy: { sortOrder: "asc" },
  select: { id: true, categoryId: true, quantity: true, required: true, category: { select: { name: true } } },
} as const satisfies Prisma.EquipmentSet$slotsArgs;

/** Admin screen: every set, including inactive, with how many items use it. */
export async function listSets() {
  const { db } = await companyContext();
  return db.equipmentSet.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      notes: true,
      isActive: true,
      mainCategoryId: true,
      mainCategory: { select: { name: true } },
      slots: slotSelect,
      _count: { select: { items: true } },
    },
  });
}

export type SetRow = Awaited<ReturnType<typeof listSets>>[number];

/** Active sets whose main item is of this type (for the item page). */
export async function getSetsForCategory(categoryId: string) {
  const { db } = await companyContext();
  return db.equipmentSet.findMany({
    where: { mainCategoryId: categoryId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * What the sign-out form needs: the active sets, and the items that can be handed out in the
 * viewed deployment — not a component of anything, and either free (in the armory or stored) or
 * signed out to a soldier, with that soldier as `holder`.
 */
export async function getSetSignData() {
  await connection();
  const { db, deployment } = await companyContext();
  if (!deployment) return { sets: [], items: [] };
  const [sets, rows] = await Promise.all([
    db.equipmentSet.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, notes: true, mainCategoryId: true, mainCategory: { select: { name: true } }, slots: slotSelect },
    }),
    // Free items in the armory, plus items already signed out to a soldier (the form shows who
    // holds each; picking one held by someone else moves it to the set's soldier).
    db.equipmentItem.findMany({
      where: {
        parentId: null,
        OR: [
          inState(deployment.id, { soldierId: null, status: { in: ["IN_ARMORY", "STORED"] } }),
          inState(deployment.id, { soldierId: { not: null } }),
        ],
      },
      orderBy: [{ category: { name: "asc" } }, { serialNumber: { sort: "asc", nulls: "last" } }],
      take: 3000,
      select: {
        id: true,
        serialNumber: true,
        categoryId: true,
        category: { select: { name: true } },
        components: { select: { id: true, serialNumber: true, categoryId: true, category: { select: { name: true } } } },
        assignments: { where: { deploymentId: deployment.id }, take: 1, select: { soldier: { select: { id: true, name: true } } } },
      },
    }),
  ]);
  return {
    sets,
    items: rows.map(({ assignments, ...i }) => ({ ...i, holder: assignments[0]?.soldier ?? null })),
  };
}

export type SignSet = Awaited<ReturnType<typeof getSetSignData>>["sets"][number];
export type SignItem = Awaited<ReturnType<typeof getSetSignData>>["items"][number];
