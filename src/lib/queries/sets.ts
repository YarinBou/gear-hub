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
 * viewed deployment — not a component of anything, nobody holds them, in the armory or stored.
 */
export async function getSetSignData() {
  await connection();
  const { db, deployment } = await companyContext();
  if (!deployment) return { sets: [], items: [] };
  const [sets, items] = await Promise.all([
    db.equipmentSet.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, notes: true, mainCategoryId: true, mainCategory: { select: { name: true } }, slots: slotSelect },
    }),
    db.equipmentItem.findMany({
      where: {
        parentId: null,
        ...inState(deployment.id, { soldierId: null, status: { in: ["IN_ARMORY", "STORED"] } }),
      },
      orderBy: [{ category: { name: "asc" } }, { serialNumber: { sort: "asc", nulls: "last" } }],
      take: 3000,
      select: {
        id: true,
        serialNumber: true,
        categoryId: true,
        category: { select: { name: true } },
        components: { select: { id: true, serialNumber: true, categoryId: true, category: { select: { name: true } } } },
      },
    }),
  ]);
  return { sets, items };
}

export type SignSet = Awaited<ReturnType<typeof getSetSignData>>["sets"][number];
export type SignItem = Awaited<ReturnType<typeof getSetSignData>>["items"][number];
