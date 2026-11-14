import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { CatalogDomain } from "@/generated/prisma/enums";

/** Cache tag for every catalog-derived dropdown. Catalog mutations call updateTag(CATALOG_TAG). */
export const CATALOG_TAG = "catalog";

export const CATALOG_DOMAINS: CatalogDomain[] = ["EQUIPMENT", "AMMUNITION", "STORAGE"];

/**
 * Active types of one domain, for dropdowns in every module (cached, shared across requests).
 * Contains no per-user data — callers still authorize with requireUser().
 */
export async function getActiveCategories(domain: CatalogDomain) {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("hours");
  return prisma.equipmentCategory.findMany({
    where: { domain, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ammoCategory: true, minThreshold: true, requiresExpiry: true },
  });
}

/** Admin catalog screen: all types of a domain, including inactive, with usage counts. */
export async function listCatalog(domain: CatalogDomain) {
  const rows = await prisma.equipmentCategory.findMany({
    where: { domain },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { equipmentItems: true, ammoStocks: true } },
      storageItems: { select: { currentQuantity: true, targetQuantity: true } },
    },
  });
  return rows.map(({ _count, storageItems, ...c }) => ({
    ...c,
    // The empty storage row opened automatically for a new STORAGE type doesn't count as usage.
    usage:
      _count.equipmentItems +
      _count.ammoStocks +
      storageItems.filter((s) => s.currentQuantity > 0 || s.targetQuantity > 0).length,
  }));
}

export type CatalogRow = Awaited<ReturnType<typeof listCatalog>>[number];

export async function getCatalogCounts() {
  const rows = await prisma.equipmentCategory.groupBy({ by: ["domain"], _count: { _all: true } });
  const counts = Object.fromEntries(CATALOG_DOMAINS.map((d) => [d, 0])) as Record<CatalogDomain, number>;
  for (const r of rows) counts[r.domain] = r._count._all;
  return counts;
}
