import "server-only";
import { connection } from "next/server";
import { getActiveCategories } from "@/lib/queries/catalog";
import { companyContext } from "@/lib/context";
import { EQUIPMENT_STATUSES } from "@/lib/constants";
import { staleWhere } from "@/lib/equipment-rules";
import type { EquipmentStatus, Platoon } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const PAGE_SIZE = 100;

/** Active equipment types for dropdowns (cached; see lib/queries/catalog.ts). */
export async function getEquipmentCategories() {
  const all = await getActiveCategories("EQUIPMENT");
  return all.map(({ id, name }) => ({ id, name }));
}

export type EquipmentFilters = {
  q?: string;
  status?: EquipmentStatus;
  categoryId?: string;
  platoon?: Platoon | "NONE";
  stale?: boolean;
  /** Only items whose serial number hasn't been recorded yet. */
  noSerial?: boolean;
  page?: number;
};

function buildWhere(f: EquipmentFilters, now: Date): Prisma.EquipmentItemWhereInput {
  const and: Prisma.EquipmentItemWhereInput[] = [];
  if (f.status) and.push({ status: f.status });
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.platoon === "NONE") and.push({ platoon: null });
  else if (f.platoon) and.push({ platoon: f.platoon });
  if (f.stale) and.push(staleWhere(now));
  if (f.noSerial) and.push({ serialNumber: null });
  if (f.q) {
    and.push({
      OR: [
        { serialNumber: { contains: f.q, mode: "insensitive" } },
        { assignedSoldier: { name: { contains: f.q, mode: "insensitive" } } },
        { assignedSoldier: { personalNumber: { contains: f.q } } },
        { notes: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export async function listEquipment(f: EquipmentFilters) {
  await connection();
  const { db } = await companyContext();
  const now = new Date();
  const where = buildWhere(f, now);
  const page = Math.max(1, f.page ?? 1);
  const [items, total] = await Promise.all([
    db.equipmentItem.findMany({
      where,
      orderBy: [{ category: { name: "asc" } }, { serialNumber: { sort: "asc", nulls: "last" } }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        serialNumber: true,
        status: true,
        platoon: true,
        lastVerifiedAt: true,
        category: { select: { name: true } },
        assignedSoldier: { select: { id: true, name: true } },
        parent: { select: { id: true, serialNumber: true, category: { select: { name: true } } } },
        _count: { select: { components: true } },
      },
    }),
    db.equipmentItem.count({ where }),
  ]);
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type EquipmentListItem = Awaited<ReturnType<typeof listEquipment>>["items"][number];

/** Counts for the status chips + stale chip (unfiltered, company-wide). */
export async function getEquipmentCounts() {
  await connection();
  const { db } = await companyContext();
  const [byStatus, stale, total, noSerial] = await Promise.all([
    db.equipmentItem.groupBy({ by: ["status"], _count: { _all: true } }),
    db.equipmentItem.count({ where: staleWhere() }),
    db.equipmentItem.count(),
    db.equipmentItem.count({ where: { serialNumber: null } }),
  ]);
  const status = Object.fromEntries(EQUIPMENT_STATUSES.map((s) => [s, 0])) as Record<EquipmentStatus, number>;
  for (const r of byStatus) status[r.status] = r._count._all;
  return { status, stale, total, noSerial };
}

export async function getEquipmentItem(id: string) {
  const { db } = await companyContext();
  return db.equipmentItem.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      assignedSoldier: { select: { id: true, name: true, platoon: true } },
      personalKit: { select: { kitNumber: true } },
      parent: { select: { id: true, serialNumber: true, category: { select: { name: true } } } },
      components: {
        orderBy: [{ category: { name: "asc" } }, { serialNumber: { sort: "asc", nulls: "last" } }],
        select: { id: true, serialNumber: true, status: true, category: { select: { name: true } } },
      },
      logs: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          fromSoldier: { select: { id: true, name: true } },
          toSoldier: { select: { id: true, name: true } },
          performedBy: { select: { name: true } },
        },
      },
    },
  });
}

export type EquipmentDetail = NonNullable<Awaited<ReturnType<typeof getEquipmentItem>>>;

/**
 * Items that can be attached as components of `parentId`: not a component already, not a set
 * themselves, and either unassigned or held by the same soldier as the parent.
 */
export async function getComponentCandidates(parent: { id: string; assignedSoldierId: string | null }) {
  const { db } = await companyContext();
  return db.equipmentItem.findMany({
    where: {
      id: { not: parent.id },
      parentId: null,
      components: { none: {} },
      OR: [{ assignedSoldierId: null }, ...(parent.assignedSoldierId ? [{ assignedSoldierId: parent.assignedSoldierId }] : [])],
    },
    orderBy: [{ category: { name: "asc" } }, { serialNumber: { sort: "asc", nulls: "last" } }],
    take: 300,
    select: { id: true, serialNumber: true, category: { select: { name: true } }, assignedSoldierId: true },
  });
}

export type ComponentCandidate = Awaited<ReturnType<typeof getComponentCandidates>>[number];

/**
 * The company equipment report (דוח צל"ם פלוגתי): every type with its items, holders and
 * held-vs-תקן totals. "Held" excludes items marked missing.
 */
export async function getEquipmentReport(platoon?: Platoon) {
  await connection();
  const { db } = await companyContext();
  const categories = await db.equipmentCategory.findMany({
    where: { domain: "EQUIPMENT", OR: [{ isActive: true }, { equipmentItems: { some: {} } }] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      targetQuantity: true,
      equipmentItems: {
        where: platoon ? { platoon } : {},
        orderBy: [{ platoon: { sort: "asc", nulls: "last" } }, { serialNumber: { sort: "asc", nulls: "last" } }],
        select: {
          id: true,
          serialNumber: true,
          status: true,
          platoon: true,
          notes: true,
          assignedSoldier: { select: { name: true, personalNumber: true } },
          parent: { select: { serialNumber: true, category: { select: { name: true } } } },
          components: { select: { serialNumber: true, category: { select: { name: true } } } },
        },
      },
    },
  });
  return categories.map((c) => {
    const missing = c.equipmentItems.filter((i) => i.status === "MISSING").length;
    const held = c.equipmentItems.length - missing;
    return {
      ...c,
      held,
      missing,
      noSerial: c.equipmentItems.filter((i) => !i.serialNumber).length,
      // Gap vs תקן only makes sense company-wide, not when filtered to one platoon.
      gap: !platoon && c.targetQuantity != null ? c.targetQuantity - held : null,
    };
  });
}

export type EquipmentReportType = Awaited<ReturnType<typeof getEquipmentReport>>[number];
