import "server-only";
import { parseAttributeDefs } from "@/lib/equipment-attributes";
import { cacheLife, cacheTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { companyContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import type { CatalogDomain } from "@/generated/prisma/enums";

/** Cache tag for one company's catalog dropdowns. Catalog mutations call updateTag(catalogTag(companyId)). */
export const catalogTag = (companyId: string) => `catalog:${companyId}`;

export const CATALOG_DOMAINS: CatalogDomain[] = ["EQUIPMENT", "AMMUNITION", "STORAGE"];

/** Active types of one domain in the current user's company, for dropdowns (cached per company). */
export async function getActiveCategories(domain: CatalogDomain) {
  const { companyId } = await requireUser();
  return cachedActiveCategories(companyId, domain);
}

/** companyId is part of the cache key, so companies never see each other's entries. */
async function cachedActiveCategories(companyId: string, domain: CatalogDomain) {
  "use cache";
  cacheTag(catalogTag(companyId));
  cacheLife("hours");
  return scopedDb(companyId).equipmentCategory.findMany({
    where: { domain, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ammoCategory: true, minThreshold: true, requiresExpiry: true, attributes: true },
  });
}

/** Admin catalog screen: all types of a domain, including inactive, with usage counts. */
export async function listCatalog(domain: CatalogDomain) {
  const { db } = await companyContext();
  const rows = await db.equipmentCategory.findMany({
    where: { domain },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { equipmentItems: true, ammoStocks: true } },
      storageItems: { select: { currentQuantity: true, targetQuantity: true } },
    },
  });
  return rows.map(({ _count, storageItems, attributes, ...c }) => ({
    ...c,
    attributes: parseAttributeDefs(attributes),
    // The empty storage row opened automatically for a new STORAGE type doesn't count as usage.
    usage:
      _count.equipmentItems +
      _count.ammoStocks +
      storageItems.filter((s) => s.currentQuantity > 0 || s.targetQuantity > 0).length,
  }));
}

export type CatalogRow = Awaited<ReturnType<typeof listCatalog>>[number];

export async function getCatalogCounts() {
  const { db } = await companyContext();
  const rows = await db.equipmentCategory.groupBy({ by: ["domain"], _count: { _all: true } });
  const counts = Object.fromEntries(CATALOG_DOMAINS.map((d) => [d, 0])) as Record<CatalogDomain, number>;
  for (const r of rows) counts[r.domain] = r._count._all;
  return counts;
}
