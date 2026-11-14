import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PLATOONS } from "@/lib/constants";
import type { Platoon } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

/** Cache tag for anything derived from the roster. Mutations call updateTag(SOLDIERS_TAG). */
export const SOLDIERS_TAG = "soldiers";

export type SoldierOption = { id: string; name: string; platoon: Platoon; personalNumber: string | null };

/**
 * Active soldiers for dropdowns across the app (equipment assignment, kit sign-out, …).
 * Cached and shared across requests; invalidated whenever the roster changes.
 * Contains no per-user data — callers must still authorize with requireUser().
 */
export async function getSoldierOptions(): Promise<SoldierOption[]> {
  "use cache";
  cacheTag(SOLDIERS_TAG);
  cacheLife("hours");
  return prisma.soldier.findMany({
    where: { isActive: true },
    orderBy: [{ platoon: "asc" }, { name: "asc" }],
    select: { id: true, name: true, platoon: true, personalNumber: true },
  });
}

export type RosterFilters = { platoon?: Platoon; q?: string; includeInactive?: boolean };

export async function listSoldiers({ platoon, q, includeInactive }: RosterFilters) {
  const where: Prisma.SoldierWhereInput = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(platoon ? { platoon } : {}),
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
  return prisma.soldier.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { platoon: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      personalNumber: true,
      phone: true,
      platoon: true,
      position: true,
      isActive: true,
      kit: { select: { kitNumber: true } },
      _count: { select: { equipment: true } },
    },
  });
}

export async function getRosterCounts() {
  const rows = await prisma.soldier.groupBy({ by: ["platoon"], where: { isActive: true }, _count: { _all: true } });
  const counts = Object.fromEntries(PLATOONS.map((p) => [p, 0])) as Record<Platoon, number>;
  for (const r of rows) counts[r.platoon] = r._count._all;
  return { byPlatoon: counts, total: rows.reduce((a, r) => a + r._count._all, 0) };
}

export async function getSoldier(id: string) {
  return prisma.soldier.findUnique({
    where: { id },
    include: {
      kit: { select: { id: true, kitNumber: true, signedAt: true } },
      equipment: {
        orderBy: { serialNumber: "asc" },
        select: {
          id: true,
          serialNumber: true,
          status: true,
          lastVerifiedAt: true,
          category: { select: { name: true } },
        },
      },
    },
  });
}

export type SoldierDetail = NonNullable<Awaited<ReturnType<typeof getSoldier>>>;
