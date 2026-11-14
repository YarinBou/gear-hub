import "server-only";
import { connection } from "next/server";
import { companyContext } from "@/lib/context";
import { kitChecklistSelect, kitReadiness } from "@/lib/kit";
import { PLATOONS, TOTAL_KITS } from "@/lib/constants";
import { staleWhere } from "@/lib/equipment-rules";
import { isLowStock } from "@/lib/ammo-rules";
import { storageFlags } from "@/lib/storage-rules";
import type { AmmoCategory, EquipmentStatus, Platoon } from "@/generated/prisma/enums";

export type KitCell = {
  kitNumber: number;
  readiness: number | null; // null = kit record not created yet
  soldierName: string | null;
  platoon: Platoon | null;
};

export async function getDashboardData() {
  const { db } = await companyContext();
  // Live operational data: always render at request time (before reading the clock).
  await connection();
  const stale = staleWhere();

  const [
    soldiersByPlatoon,
    equipmentByStatus,
    equipmentByPlatoon,
    staleItems,
    staleCount,
    ammoCategories,
    ammoTotals,
    kits,
    storageItems,
  ] = await Promise.all([
    db.soldier.groupBy({ by: ["platoon"], where: { isActive: true }, _count: { _all: true } }),
    db.equipmentItem.groupBy({ by: ["status"], _count: { _all: true } }),
    db.equipmentItem.groupBy({ by: ["platoon"], _count: { _all: true } }),
    db.equipmentItem.findMany({
      where: stale,
      orderBy: [{ lastVerifiedAt: { sort: "asc", nulls: "first" } }],
      take: 5,
      select: {
        id: true,
        serialNumber: true,
        lastVerifiedAt: true,
        category: { select: { name: true } },
        assignedSoldier: { select: { name: true } },
      },
    }),
    db.equipmentItem.count({
      where: stale,
    }),
    db.equipmentCategory.findMany({
      where: { domain: "AMMUNITION", isActive: true },
      select: { id: true, name: true, ammoCategory: true, minThreshold: true },
    }),
    db.ammoStock.groupBy({ by: ["categoryId"], _sum: { quantity: true } }),
    db.personalKit.findMany({
      orderBy: { kitNumber: "asc" },
      select: {
        kitNumber: true,
        soldier: { select: { name: true, platoon: true } },
        ...kitChecklistSelect,
      },
    }),
    db.storageItem.findMany({
      select: {
        id: true,
        targetQuantity: true,
        currentQuantity: true,
        status: true,
        expiryDate: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  // ── Roster ──
  const roster = Object.fromEntries(PLATOONS.map((p) => [p, 0])) as Record<Platoon, number>;
  for (const row of soldiersByPlatoon) roster[row.platoon] = row._count._all;
  const rosterTotal = Object.values(roster).reduce((a, b) => a + b, 0);

  // ── Equipment ──
  const statusCounts: Partial<Record<EquipmentStatus, number>> = {};
  for (const row of equipmentByStatus) statusCounts[row.status] = row._count._all;
  const equipmentTotal = equipmentByStatus.reduce((a, r) => a + r._count._all, 0);
  const equipmentPlatoon = Object.fromEntries(PLATOONS.map((p) => [p, 0])) as Record<Platoon, number>;
  let equipmentUnassigned = 0;
  for (const row of equipmentByPlatoon) {
    if (row.platoon) equipmentPlatoon[row.platoon] = row._count._all;
    else equipmentUnassigned += row._count._all;
  }

  // ── Ammo ──
  const totalsById = new Map(ammoTotals.map((t) => [t.categoryId, t._sum.quantity ?? 0]));
  const ammo = ammoCategories.map((c) => ({
    id: c.id,
    name: c.name,
    ammoCategory: c.ammoCategory as AmmoCategory | null,
    quantity: totalsById.get(c.id) ?? 0,
    minThreshold: c.minThreshold,
  }));
  const lowAmmo = ammo.filter((a) => isLowStock(a.quantity, a.minThreshold));

  // ── Kits (always show all 98 slots) ──
  const kitMap = new Map(kits.map((k) => [k.kitNumber, k]));
  const kitCells: KitCell[] = Array.from({ length: TOTAL_KITS }, (_, i) => {
    const k = kitMap.get(i + 1);
    return {
      kitNumber: i + 1,
      readiness: k ? kitReadiness(k) : null,
      soldierName: k?.soldier?.name ?? null,
      platoon: k?.soldier?.platoon ?? null,
    };
  });
  const issuedKits = kitCells.filter((k) => k.soldierName);
  const avgReadiness = issuedKits.length
    ? Math.round(issuedKits.reduce((a, k) => a + (k.readiness ?? 0), 0) / issuedKits.length)
    : 0;
  const fullKits = issuedKits.filter((k) => k.readiness === 100).length;

  // ── Storage ──
  // Same rules as the storage page (an empty batch can't "expire").
  const now = new Date();
  const withFlags = storageItems.map((s) => ({ ...s, flags: storageFlags(s, now) }));
  const storageShortages = withFlags.filter((s) => s.flags.shortage);
  const expiring = withFlags
    .filter((s) => s.flags.expired || s.flags.expiringSoon)
    .map((s) => ({ ...s, expired: s.flags.expired }))
    .sort((a, b) => a.expiryDate!.getTime() - b.expiryDate!.getTime());
  const storageTarget = storageItems.reduce((a, s) => a + s.targetQuantity, 0);
  const storageCurrent = storageItems.reduce((a, s) => a + Math.min(s.currentQuantity, s.targetQuantity), 0);

  return {
    roster: { byPlatoon: roster, total: rosterTotal },
    equipment: {
      total: equipmentTotal,
      byStatus: statusCounts,
      byPlatoon: equipmentPlatoon,
      unassigned: equipmentUnassigned,
      staleCount,
      staleItems,
    },
    ammo: { types: ammo, low: lowAmmo },
    kits: { cells: kitCells, issued: issuedKits.length, avgReadiness, fullKits },
    storage: {
      itemCount: storageItems.length,
      shortages: storageShortages,
      expiring,
      fillRate: storageTarget ? Math.round((storageCurrent / storageTarget) * 100) : 100,
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
