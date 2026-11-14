import "server-only";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { TOTAL_KITS } from "@/lib/constants";
import { KIT_ITEM_KEYS, kitChecklistSelect, kitReadiness, type KitBooleanKey } from "@/lib/kit";
import type { Platoon } from "@/generated/prisma/enums";

export type KitTile = {
  kitNumber: number;
  soldier: { id: string; name: string; platoon: Platoon } | null;
  readiness: number;
  missing: KitBooleanKey[];
  signedAt: Date | null;
  lastInspectedAt: Date | null;
};

/** All 98 slots, including kits whose DB row doesn't exist yet. */
export async function listKits(): Promise<KitTile[]> {
  await connection();
  const kits = await prisma.personalKit.findMany({
    select: {
      kitNumber: true,
      signedAt: true,
      lastInspectedAt: true,
      soldier: { select: { id: true, name: true, platoon: true } },
      ...kitChecklistSelect,
    },
  });
  const byNumber = new Map(kits.map((k) => [k.kitNumber, k]));
  return Array.from({ length: TOTAL_KITS }, (_, i) => {
    const k = byNumber.get(i + 1);
    return {
      kitNumber: i + 1,
      soldier: k?.soldier ?? null,
      readiness: k ? kitReadiness(k) : 0,
      missing: k ? KIT_ITEM_KEYS.filter((key) => !k[key]) : [...KIT_ITEM_KEYS],
      signedAt: k?.signedAt ?? null,
      lastInspectedAt: k?.lastInspectedAt ?? null,
    };
  });
}

export async function getKit(kitNumber: number) {
  return prisma.personalKit.findUnique({
    where: { kitNumber },
    include: {
      soldier: { select: { id: true, name: true, platoon: true, personalNumber: true, phone: true } },
      personalWeapon: {
        select: { id: true, serialNumber: true, status: true, category: { select: { name: true } } },
      },
      signedBy: { select: { name: true } },
      inspections: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { performedBy: { select: { name: true } } },
      },
    },
  });
}

export type KitDetail = NonNullable<Awaited<ReturnType<typeof getKit>>>;

/** Previous / next *issued* kit numbers, for walking through a מסדר. */
export async function getKitNeighbours(kitNumber: number, platoon?: Platoon) {
  const where = { soldierId: { not: null }, ...(platoon ? { soldier: { platoon } } : {}) };
  const [prev, next] = await Promise.all([
    prisma.personalKit.findFirst({
      where: { ...where, kitNumber: { lt: kitNumber } },
      orderBy: { kitNumber: "desc" },
      select: { kitNumber: true },
    }),
    prisma.personalKit.findFirst({
      where: { ...where, kitNumber: { gt: kitNumber } },
      orderBy: { kitNumber: "asc" },
      select: { kitNumber: true },
    }),
  ]);
  return { prev: prev?.kitNumber ?? null, next: next?.kitNumber ?? null };
}

/** Soldier ids that already hold a kit (other than `exceptKit`). */
export async function getSoldiersWithKit(exceptKit?: number) {
  const rows = await prisma.personalKit.findMany({
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
  const items = await prisma.equipmentItem.findMany({
    where: {
      OR: [
        ...(soldierId ? [{ assignedSoldierId: soldierId }] : []),
        { assignedSoldierId: null, status: "IN_ARMORY" as const },
        ...(currentWeaponId ? [{ id: currentWeaponId }] : []),
      ],
      AND: [{ OR: [{ personalKit: { is: null } }, ...(currentWeaponId ? [{ id: currentWeaponId }] : [])] }],
    },
    orderBy: [{ category: { name: "asc" } }, { serialNumber: "asc" }],
    take: 300,
    select: { id: true, serialNumber: true, assignedSoldierId: true, category: { select: { name: true } } },
  });
  return items.map((i) => ({
    id: i.id,
    serialNumber: i.serialNumber,
    category: i.category.name,
    heldBySoldier: !!soldierId && i.assignedSoldierId === soldierId,
  }));
}

export type WeaponOption = Awaited<ReturnType<typeof getWeaponOptions>>[number];
