import "server-only";
import { connection } from "next/server";
import { companyContext } from "@/lib/context";
import { ammoLevel, type AmmoLevel } from "@/lib/ammo-rules";
import { platoonSelect } from "@/lib/platoons";
import type { AmmoCategory } from "@/generated/prisma/enums";

const RECENT_LOGS = 5;

/**
 * Every active ammo type (plus inactive ones that still hold stock), with its locations,
 * company-wide total, level against the threshold, and the latest log entries per location —
 * all in the viewed deployment.
 */
export async function getAmmoOverview() {
  await connection();
  const { db, deployment } = await companyContext();
  // Categories are company-level, so the stock under them is filtered by deployment explicitly
  // (scopedDb does not rewrite nested relations).
  const deploymentId = deployment?.id ?? "__no_deployment__";
  const categories = await db.equipmentCategory.findMany({
    where: {
      domain: "AMMUNITION",
      OR: [{ isActive: true }, { ammoStocks: { some: { deploymentId, quantity: { gt: 0 } } } }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isActive: true,
      ammoCategory: true,
      minThreshold: true,
      ammoStocks: {
        where: { deploymentId },
        orderBy: { location: "asc" },
        select: {
          id: true,
          location: true,
          soldier: { select: { id: true, name: true, platoon: platoonSelect } },
          quantity: true,
          lastCountedAt: true,
          notes: true,
          logs: {
            orderBy: { createdAt: "desc" },
            take: RECENT_LOGS,
            select: {
              id: true,
              type: true,
              amount: true,
              previousQuantity: true,
              newQuantity: true,
              note: true,
              createdAt: true,
              performedBy: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return categories.map((c) => {
    const total = c.ammoStocks.reduce((a, s) => a + s.quantity, 0);
    const lastCountedAt = c.ammoStocks.reduce<Date | null>(
      (latest, s) => (s.lastCountedAt && (!latest || s.lastCountedAt > latest) ? s.lastCountedAt : latest),
      null,
    );
    return {
      ...c,
      ammoCategory: c.ammoCategory as AmmoCategory | null,
      total,
      level: ammoLevel(total, c.minThreshold) as AmmoLevel,
      lastCountedAt,
    };
  });
}

export type AmmoTypeOverview = Awaited<ReturnType<typeof getAmmoOverview>>[number];
export type AmmoStockRow = AmmoTypeOverview["ammoStocks"][number];

/** Existing place names (not soldiers), for the location autocomplete and filter. */
export async function getAmmoLocations() {
  const { db } = await companyContext();
  const rows = await db.ammoStock.findMany({
    where: { soldierId: null },
    distinct: ["location"],
    select: { location: true },
    orderBy: { location: "asc" },
  });
  return rows.map((r) => r.location);
}
