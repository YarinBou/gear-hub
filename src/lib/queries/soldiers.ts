import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { companyContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { parseReturnLines } from "@/lib/kit";
import { platoonSelect, type PlatoonRef } from "@/lib/platoons";
import type { Prisma } from "@/generated/prisma/client";

/** Matches no row: nested relation filters when no deployment is being viewed. */
const NO_DEPLOYMENT = "__no_deployment__";

/** Cache tag for one company's roster. Roster mutations call updateTag(soldiersTag(companyId)). */
export const soldiersTag = (companyId: string) => `soldiers:${companyId}`;

export type SoldierOption = { id: string; name: string; platoon: PlatoonRef; personalNumber: string | null };

/**
 * Active soldiers of the current user's company who are in the viewed deployment, for dropdowns
 * across the app (equipment assignment, kit sign-out, …). The roster is cached per company and
 * invalidated whenever it changes; who is out of the deployment is read fresh.
 */
export async function getSoldierOptions(): Promise<SoldierOption[]> {
  const { user, db, deployment } = await companyContext();
  const all = await cachedSoldierOptions(user.companyId);
  if (!deployment) return all;
  // `db` is scoped to the viewed deployment.
  const out = new Set((await db.deploymentAbsence.findMany({ select: { soldierId: true } })).map((a) => a.soldierId));
  return out.size ? all.filter((s) => !out.has(s.id)) : all;
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

/** presence: in / not in the viewed deployment (see DeploymentAbsence). */
export type RosterFilters = { platoonId?: string; q?: string; includeInactive?: boolean; presence?: "in" | "out" };

export async function listSoldiers({ platoonId, q, includeInactive, presence }: RosterFilters) {
  const { db, deployment } = await companyContext();
  const deploymentId = deployment?.id ?? NO_DEPLOYMENT;
  const where: Prisma.SoldierWhereInput = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(platoonId ? { platoonId } : {}),
    ...(presence && deployment
      ? { absences: presence === "out" ? { some: { deploymentId: deployment.id } } : { none: { deploymentId: deployment.id } } }
      : {}),
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
      absences: { where: { deploymentId }, take: 1, select: { id: true } },
    },
  });
  return rows.map(({ kits, _count, absences, ...s }) => ({
    ...s,
    kit: kits[0] ?? null,
    _count: { equipment: _count.assignments },
    /** null when no deployment is viewed. */
    inDeployment: deployment ? absences.length === 0 : null,
  }));
}

export async function getRosterCounts() {
  const { db } = await companyContext();
  const rows = await db.soldier.groupBy({ by: ["platoonId"], where: { isActive: true }, _count: { _all: true } });
  /** platoonId → active soldiers (platoons with none are absent). */
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.platoonId] = r._count._all;
  // Active soldiers marked as not in the viewed deployment (`db` is scoped to it).
  const out = await db.deploymentAbsence.count({ where: { soldier: { isActive: true } } });
  return { byPlatoon: counts, total: rows.reduce((a, r) => a + r._count._all, 0), out };
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
      absences: { where: { deploymentId }, take: 1, select: { id: true } },
      assignments: {
        where: { deploymentId },
        orderBy: { item: { serialNumber: "asc" } },
        select: {
          status: true,
          lastVerifiedAt: true,
          item: { select: { id: true, serialNumber: true, parentId: true, category: { select: { name: true } } } },
        },
      },
    },
  });
  if (!soldier) return null;
  const { kits, assignments, absences, ...rest } = soldier;
  return {
    ...rest,
    kit: kits[0] ?? null,
    equipment: assignments.map((a) => ({ ...a.item, status: a.status, lastVerifiedAt: a.lastVerifiedAt })),
    /** null when no deployment is viewed. */
    inDeployment: deployment ? absences.length === 0 : null,
  };
}

export type SoldierDetail = NonNullable<Awaited<ReturnType<typeof getSoldier>>>;

/**
 * What the soldier returned over time, across all deployments: each kit return (what was signed
 * for vs what came back, with gap notes) and each צל"ם item taken back from them. Lets the company
 * see what someone held before and sign them out the same again.
 */
export async function getSoldierReturnHistory(soldierId: string) {
  const { user } = await companyContext();
  // Across deployments: company-scoped only (KitReturn / EquipmentLog aren't deployment models).
  const db = scopedDb(user.companyId);
  const [kitReturns, equipmentReturns] = await Promise.all([
    db.kitReturn.findMany({
      where: { soldierId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        lines: true,
        gapCount: true,
        note: true,
        performedBy: { select: { name: true } },
        kit: { select: { kitNumber: true, deployment: { select: { name: true } } } },
      },
    }),
    // Items that left this soldier (to nobody or to someone else). Components moving with their
    // main item are left out — the main item stands for the set.
    db.equipmentLog.findMany({
      where: { fromSoldierId: soldierId, OR: [{ toSoldierId: null }, { toSoldierId: { not: soldierId } }], item: { parentId: null } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        note: true,
        toStatus: true,
        toSoldier: { select: { name: true } },
        deployment: { select: { name: true } },
        item: { select: { id: true, serialNumber: true, category: { select: { name: true } } } },
      },
    }),
  ]);
  return {
    kitReturns: kitReturns.map(({ lines, ...r }) => ({ ...r, lines: parseReturnLines(lines) })),
    equipmentReturns,
  };
}

export type SoldierReturnHistory = Awaited<ReturnType<typeof getSoldierReturnHistory>>;
