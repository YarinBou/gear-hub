import "server-only";
import { connection } from "next/server";
import { getActiveCategories } from "@/lib/queries/catalog";
import { companyContext } from "@/lib/context";
import { EQUIPMENT_STATUSES } from "@/lib/constants";
import { staleWhere } from "@/lib/equipment-rules";
import { flattenState, inState, NO_ITEMS, stateSelect } from "@/lib/equipment-state";
import { missingSummary, setStatus } from "@/lib/equipment-sets";
import { slotSelect } from "@/lib/queries/sets";
import type { EquipmentStatus } from "@/generated/prisma/enums";
import { platoonSelect } from "@/lib/platoons";
import { getPlatoons } from "@/lib/queries/platoons";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// Items are company-level; their holder / status / platoon come from the deployment being viewed.
// Without a deployment every item is "in the armory" and state filters match accordingly.

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
  /** A platoon id, or "NONE" for items with no platoon. */
  platoonId?: string | "NONE";
  stale?: boolean;
  /** Only main items whose set (מארז) is missing required components. */
  setMissing?: boolean;
  /** Only items whose serial number hasn't been recorded yet. */
  noSerial?: boolean;
  page?: number;
};

function buildWhere(f: EquipmentFilters, now: Date, deploymentId: string | null): Prisma.EquipmentItemWhereInput {
  const and: Prisma.EquipmentItemWhereInput[] = [];
  const state = (where: Prisma.EquipmentAssignmentWhereInput, matchesDefault: boolean) =>
    deploymentId ? inState(deploymentId, where) : matchesDefault ? {} : NO_ITEMS;

  if (f.status) and.push(state({ status: f.status }, f.status === "IN_ARMORY"));
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.platoonId === "NONE") and.push(state({ platoonId: null }, true));
  else if (f.platoonId) and.push(state({ platoonId: f.platoonId }, false));
  if (f.stale) and.push(state(staleWhere(now), false));
  if (f.noSerial) and.push({ serialNumber: null });
  if (f.q) {
    and.push({
      OR: [
        { serialNumber: { contains: f.q, mode: "insensitive" } },
        { notes: { contains: f.q, mode: "insensitive" } },
        ...(deploymentId
          ? [
              inState(deploymentId, { soldier: { name: { contains: f.q, mode: "insensitive" } } }),
              inState(deploymentId, { soldier: { personalNumber: { contains: f.q } } }),
            ]
          : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}


/** Items whose set (מארז) is missing required components. Computed in memory — sets are few. */
async function incompleteSetItemIds(db: PrismaClient) {
  const items = await db.equipmentItem.findMany({
    where: { setId: { not: null } },
    select: { id: true, set: { select: { slots: slotSelect } }, components: { select: { categoryId: true } } },
  });
  return items.filter((i) => i.set && !setStatus(i.set.slots, i.components).complete).map((i) => i.id);
}

export async function listEquipment(f: EquipmentFilters) {
  await connection();
  const { db, deployment } = await companyContext();
  const deploymentId = deployment?.id ?? null;
  const now = new Date();
  const base = buildWhere(f, now, deploymentId);
  const where = f.setMissing ? { AND: [base, { id: { in: await incompleteSetItemIds(db) } }] } : base;
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
        category: { select: { name: true } },
        parent: { select: { id: true, serialNumber: true, category: { select: { name: true } } } },
        _count: { select: { components: true } },
        set: { select: { name: true, slots: slotSelect } },
        components: { select: { categoryId: true } },
        ...stateSelect(deploymentId, { id: true, name: true }),
      },
    }),
    db.equipmentItem.count({ where }),
  ]);
  const rows = items.map(({ set, components, ...i }) => {
    const status = set ? setStatus(set.slots, components) : null;
    // "What's missing from its set" — null when it isn't a set or the set is complete.
    const setMissing = status && !status.complete ? missingSummary(status) : null;
    return { ...flattenState(i), setName: set?.name ?? null, setMissing };
  });
  return { items: rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type EquipmentListItem = Awaited<ReturnType<typeof listEquipment>>["items"][number];

/** Counts for the status chips + stale chip (unfiltered, company-wide, in the viewed deployment). */
export async function getEquipmentCounts() {
  await connection();
  const { db, deployment } = await companyContext();
  const [total, noSerial, setMissing] = await Promise.all([
    db.equipmentItem.count(),
    db.equipmentItem.count({ where: { serialNumber: null } }),
    incompleteSetItemIds(db).then((ids) => ids.length),
  ]);
  const status = Object.fromEntries(EQUIPMENT_STATUSES.map((s) => [s, 0])) as Record<EquipmentStatus, number>;
  if (!deployment) {
    status.IN_ARMORY = total;
    return { status, stale: 0, total, noSerial, setMissing };
  }
  // `db` is scoped to the viewed deployment, so these count that deployment's state rows.
  const [byStatus, stale] = await Promise.all([
    db.equipmentAssignment.groupBy({ by: ["status"], _count: { _all: true } }),
    db.equipmentAssignment.count({ where: staleWhere() }),
  ]);
  for (const r of byStatus) status[r.status] = r._count._all;
  return { status, stale, total, noSerial, setMissing };
}

export async function getEquipmentItem(id: string) {
  const { db, deployment } = await companyContext();
  const deploymentId = deployment?.id ?? null;
  const item = await db.equipmentItem.findUnique({
    where: { id },
    select: {
      id: true,
      serialNumber: true,
      notes: true,
      createdAt: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      parent: { select: { id: true, serialNumber: true, category: { select: { name: true } } } },
      set: { select: { id: true, name: true, isActive: true, slots: slotSelect } },
      components: {
        orderBy: [{ category: { name: "asc" } }, { serialNumber: { sort: "asc", nulls: "last" } }],
        select: {
          id: true,
          categoryId: true,
          serialNumber: true,
          category: { select: { name: true } },
          ...stateSelect(deploymentId, { id: true }),
        },
      },
      personalKits: { where: { deploymentId: deploymentId ?? "" }, take: 1, select: { kitNumber: true } },
      // History across all deployments, labelled with the deployment it happened in.
      logs: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          fromSoldier: { select: { id: true, name: true } },
          toSoldier: { select: { id: true, name: true } },
          performedBy: { select: { name: true } },
          deployment: { select: { name: true } },
          platoon: { select: { name: true } },
        },
      },
      ...stateSelect(deploymentId, { id: true, name: true, platoon: platoonSelect }),
    },
  });
  if (!item) return null;
  const { personalKits, components, ...rest } = item;
  return {
    ...flattenState(rest),
    personalKit: personalKits[0] ?? null,
    components: components.map(flattenState),
  };
}

export type EquipmentDetail = NonNullable<Awaited<ReturnType<typeof getEquipmentItem>>>;

/**
 * Items that can be attached as components of `parent`: not a component already, not a set
 * themselves, and either unassigned or held by the same soldier as the parent (in the viewed deployment).
 */
export async function getComponentCandidates(parent: { id: string; assignedSoldierId: string | null }) {
  const { db, deployment } = await companyContext();
  const deploymentId = deployment?.id ?? null;
  const items = await db.equipmentItem.findMany({
    where: {
      id: { not: parent.id },
      parentId: null,
      components: { none: {} },
      ...(deploymentId
        ? {
            OR: [
              inState(deploymentId, { soldierId: null }),
              ...(parent.assignedSoldierId ? [inState(deploymentId, { soldierId: parent.assignedSoldierId })] : []),
            ],
          }
        : {}),
    },
    orderBy: [{ category: { name: "asc" } }, { serialNumber: { sort: "asc", nulls: "last" } }],
    take: 300,
    select: { id: true, serialNumber: true, category: { select: { name: true } }, ...stateSelect(deploymentId, { id: true }) },
  });
  return items.map(flattenState);
}

export type ComponentCandidate = Awaited<ReturnType<typeof getComponentCandidates>>[number];

/**
 * The company equipment report (דוח צל"ם פלוגתי) for the viewed deployment: every type with its
 * items, holders and held-vs-תקן totals. "Held" excludes items marked missing.
 */
export async function getEquipmentReport(platoonId?: string) {
  await connection();
  const { db, deployment } = await companyContext();
  const deploymentId = deployment?.id ?? null;
  const categories = await db.equipmentCategory.findMany({
    where: { domain: "EQUIPMENT", OR: [{ isActive: true }, { equipmentItems: { some: {} } }] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      targetQuantity: true,
      equipmentItems: {
        where: platoonId ? (deploymentId ? inState(deploymentId, { platoonId }) : NO_ITEMS) : {},
        orderBy: [{ serialNumber: { sort: "asc", nulls: "last" } }],
        select: {
          id: true,
          serialNumber: true,
          notes: true,
          parent: { select: { serialNumber: true, category: { select: { name: true } } } },
          components: { select: { serialNumber: true, category: { select: { name: true } } } },
          ...stateSelect(deploymentId, { name: true, personalNumber: true }),
        },
      },
    },
  });
  const order = (await getPlatoons()).map((p) => p.id);
  const platoonOrder = (p: { id: string } | null) => (p ? order.indexOf(p.id) : 99);
  return categories.map((c) => {
    const equipmentItems = c.equipmentItems
      .map(flattenState)
      .sort((a, b) => platoonOrder(a.platoon) - platoonOrder(b.platoon));
    const missing = equipmentItems.filter((i) => i.status === "MISSING").length;
    const held = equipmentItems.length - missing;
    return {
      ...c,
      equipmentItems,
      held,
      missing,
      noSerial: equipmentItems.filter((i) => !i.serialNumber).length,
      // Gap vs תקן only makes sense company-wide, not when filtered to one platoon.
      gap: !platoonId && c.targetQuantity != null ? c.targetQuantity - held : null,
    };
  });
}

export type EquipmentReportType = Awaited<ReturnType<typeof getEquipmentReport>>[number];
