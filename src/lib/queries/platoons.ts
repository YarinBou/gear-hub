import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { scopedDb } from "@/lib/db";
import type { PlatoonRef } from "@/lib/platoons";

/** Cache tag for one company's platoons. Platoon mutations call updateTag(platoonsTag(companyId)). */
export const platoonsTag = (companyId: string) => `platoons:${companyId}`;

export type PlatoonOption = PlatoonRef & { isActive: boolean };

/** All of the company's platoons in display order, including inactive ones (cached per company). */
export async function getPlatoons(): Promise<PlatoonOption[]> {
  const { companyId } = await requireUser();
  return cachedPlatoons(companyId);
}

/** Active platoons, for dropdowns. */
export async function getActivePlatoons(): Promise<PlatoonOption[]> {
  return (await getPlatoons()).filter((p) => p.isActive);
}

/** companyId is part of the cache key, so companies never see each other's entries. */
async function cachedPlatoons(companyId: string): Promise<PlatoonOption[]> {
  "use cache";
  cacheTag(platoonsTag(companyId));
  cacheLife("hours");
  return scopedDb(companyId).platoon.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, color: true, isActive: true },
  });
}
