import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { companyContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { platoonSelect, type PlatoonRef } from "@/lib/platoons";
import type { Prisma } from "@/generated/prisma/client";

/** Matches no row: nested relation filters when no deployment is being viewed. */
const NO_DEPLOYMENT = "__no_deployment__";

/** Cache tag for one company's roster. Roster mutations call updateTag(soldiersTag(companyId)). */
export const soldiersTag = (companyId: string) => `soldiers:${companyId}`;

export type SoldierOption = { id: string; name: string; platoon: PlatoonRef; personalNumber: string | null };

/**
 * Active soldiers of the current user's company, for dropdowns across the app (equipment
 * assignment, kit sign-out, …). Cached per company; invalidated whenever that roster changes.
 */
export async function getSoldierOptions(): Promise<SoldierOption[]> {
  const { companyId } = await requireUser();
  return cachedSoldierOptions(companyId);
}

/** companyId is part of the cache key, so companies never see each other's entries. */
async function cachedSoldierOptions(companyId: string): Promise<SoldierOption[]> {
  "use cache";
  cacheTag(soldiersTag(companyId));
  cacheLife("hours");
  return scopedDb(companyId).soldier.findMany({
    where: { isActive: true },
    orderBy: [{ platoon: { sortOrder: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, platoon: platoonSelect, personalNumber: true },
  });
}

export type RosterFilters = { platoonId?: string; q?: string; includeInactive?: boolean };

export async function listSoldiers({ platoonId, q, includeInactive }: RosterFilters) {
  const { db, deployment } = await companyContext();
  const deploymentId = deployment?.id ?? NO_DEPLOYMENT;
  const where: Prisma.SoldierWhereInput = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(platoonId ? { platoonId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { personalNumber: { contains: q } },
            { phone: { contains: q.replace(/\D/g, "") || q } },
            { position: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const rows = await db.soldier.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { platoon: { sortOrder: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      personalNumber: true,
      phone: true,
      platoon: platoonSelect,
      position: true,
      isActive: true,
      // Kit and equipment held in the viewed deployment.
      kits: { where: { deploymentId }, take: 1, select: { kitNumber: true } },
      _count: { select: { assignments: { where: { deploymentId } } } },
    },
  });
  return rows.map(({ kits, _count, ...s }) => ({ ...s, kit: kits[0] ?? null, _count: { equipment: _count.assignments } }));
}

export async function getRosterCounts() {
  const { db } = await companyContext();
  const rows = await db.soldier.groupBy({ by: ["platoonId"], where: { isActive: true }, _count: { _all: true } });
  /** platoonId → active soldiers (platoons with none are absent). */
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.platoonId] = r._count._all;
  return { byPlatoon: counts, total: rows.reduce((a, r) => a + r._count._all, 0) };
}

export async function getSoldier(id: string) {
  const { db, deployment } = await companyContext();
  const deploymentId = deployment?.id ?? NO_DEPLOYMENT;
  const soldier = await db.soldier.findUnique({
    where: { id },
    include: {
      platoon: platoonSelect,
      // What the soldier holds in the viewed deployment.
      kits: { where: { deploymentId }, take: 1, select: { id: true, kitNumber: true, signedAt: true } },
      assignments: {
        where: { deploymentId },
        orderBy: { item: { serialNumber: "asc" } },
        select: {
          status: true,
          lastVerifiedAt: true,
          item: { select: { id: true, serialNumber: true, category: { select: { name: true } } } },
        },
      },
    },
  });
  if (!soldier) return null;
  const { kits, assignments, ...rest } = soldier;
  return {
    ...rest,
    kit: kits[0] ?? null,
    equipment: assignments.map((a) => ({ ...a.item, status: a.status, lastVerifiedAt: a.lastVerifiedAt })),
  };
}

export type SoldierDetail = NonNullable<Awaited<ReturnType<typeof getSoldier>>>;
