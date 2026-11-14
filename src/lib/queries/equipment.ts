import "server-only";
import { connection } from "next/server";
import { getActiveCategories } from "@/lib/queries/catalog";
import { prisma } from "@/lib/prisma";
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
  page?: number;
};

function buildWhere(f: EquipmentFilters, now: Date): Prisma.EquipmentItemWhereInput {
  const and: Prisma.EquipmentItemWhereInput[] = [];
  if (f.status) and.push({ status: f.status });
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.platoon === "NONE") and.push({ platoon: null });
  else if (f.platoon) and.push({ platoon: f.platoon });
  if (f.stale) and.push(staleWhere(now));
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
  const now = new Date();
  const where = buildWhere(f, now);
  const page = Math.max(1, f.page ?? 1);
  const [items, total] = await Promise.all([
    prisma.equipmentItem.findMany({
      where,
      orderBy: [{ category: { name: "asc" } }, { serialNumber: "asc" }],
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
      },
    }),
    prisma.equipmentItem.count({ where }),
  ]);
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type EquipmentListItem = Awaited<ReturnType<typeof listEquipment>>["items"][number];

/** Counts for the status chips + stale chip (unfiltered, company-wide). */
export async function getEquipmentCounts() {
  await connection();
  const [byStatus, stale, total] = await Promise.all([
    prisma.equipmentItem.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.equipmentItem.count({ where: staleWhere() }),
    prisma.equipmentItem.count(),
  ]);
  const status = Object.fromEntries(EQUIPMENT_STATUSES.map((s) => [s, 0])) as Record<EquipmentStatus, number>;
  for (const r of byStatus) status[r.status] = r._count._all;
  return { status, stale, total };
}

export async function getEquipmentItem(id: string) {
  return prisma.equipmentItem.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      assignedSoldier: { select: { id: true, name: true, platoon: true } },
      personalKit: { select: { kitNumber: true } },
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
