import "server-only";
import { connection } from "next/server";
import { companyContext } from "@/lib/context";
import { flattenState, inState, stateSelect } from "@/lib/equipment-state";
import {
  checklistLines,
  kitItemsSelect,
  kitReadiness,
  missingDescriptions,
  parseReturnLines,
  signatureCoverage,
  stockCheckState,
  type StockCheckState,
  summarizeKits,
  type ChecklistLine,
} from "@/lib/kit";
import { activeItemDefs } from "@/lib/kit-service";
import { platoonSelect, type PlatoonRef } from "@/lib/platoons";

/** A kit's פק"ל mark (name + badge color). */
export type PakalRef = { id: string; name: string; color: number };

export type KitTile = {
  kitNumber: number;
  pakal: PakalRef | null;
  soldier: { id: string; name: string; platoon: PlatoonRef } | null;
  readiness: number;
  /** Incomplete checklist lines ("קסדה", "מחסניות (5/7)"). */
  missing: string[];
  signedAt: Date | null;
  lastInspectedAt: Date | null;
  /** Kit in stock: are its contents known (see stockCheckState). Null for an issued kit. */
  stock: { state: StockCheckState; checkedAt: Date | null } | null;
  /** Signed kit: how much of the bag the signature covers. Null when not signed. */
  coverage: { signed: number; total: number } | null;
};

/** All kit slots of the viewed deployment, including kits whose DB row doesn't exist yet. */
export async function listKits(): Promise<KitTile[]> {
  await connection();
  const { db, deployment } = await companyContext();
  const [kits, activeDefs] = await Promise.all([
    db.personalKit.findMany({
      select: {
        kitNumber: true,
        signedAt: true,
        lastInspectedAt: true,
        contentsCheckedAt: true,
        _count: { select: { returns: true } },
        soldier: { select: { id: true, name: true, platoon: platoonSelect } },
        ...kitItemsSelect,
      },
    }),
    activeItemDefs(db),
  ]);
  const history = !!deployment?.readOnly;
  const byNumber = new Map(kits.map((k) => [k.kitNumber, k]));
  const slots = await getKitSlots();
  return Array.from({ length: slots }, (_, i) => {
    const k = byNumber.get(i + 1);
    const lines = k ? checklistLines(k.items, { history, activeDefs, pakal: k.pakal }) : [];
    return {
      kitNumber: i + 1,
      pakal: k?.pakal ? { id: k.pakal.id, name: k.pakal.name, color: k.pakal.color } : null,
      soldier: k?.soldier ?? null,
      readiness: k ? kitReadiness(lines) : 0,
      missing: missingDescriptions(lines),
      signedAt: k?.signedAt ?? null,
      lastInspectedAt: k?.lastInspectedAt ?? null,
      stock: k?.soldier
        ? null
        : {
            state: stockCheckState({ contentsCheckedAt: k?.contentsCheckedAt ?? null, returned: (k?._count.returns ?? 0) > 0 }),
            checkedAt: k?.contentsCheckedAt ?? null,
          },
      coverage: k?.signedAt ? signatureCoverage(lines) : null,
    };
  });
}

export async function getKit(kitNumber: number) {
  const { db, deployment } = await companyContext();
  const activeDefs = await activeItemDefs(db);
  // Kit numbers repeat across companies and deployments; the scoped client limits this to the
  // user's company and the viewed deployment.
  const kit = await db.personalKit.findFirst({
    where: { kitNumber },
    include: {
      soldier: { select: { id: true, name: true, platoon: platoonSelect, personalNumber: true, phone: true } },
      personalWeapon: {
        select: {
          id: true,
          serialNumber: true,
          category: { select: { name: true } },
          ...stateSelect(deployment?.id ?? null, { id: true }),
        },
      },
      signedBy: { select: { name: true } },
      contentsCheckedBy: { select: { name: true } },
      _count: { select: { returns: true } },
      ...kitItemsSelect,
      inspections: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { performedBy: { select: { name: true } } },
      },
      returns: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { performedBy: { select: { name: true } } },
      },
    },
  });
  if (!kit) return null;
  const { items, returns, ...rest } = kit;
  // Live deployment: the company's current checklist. Closed one: exactly what was recorded.
  const lines: ChecklistLine[] = checklistLines(items, { history: !!deployment?.readOnly, activeDefs, pakal: kit.pakal });
  return {
    ...rest,
    lines,
    returns: returns.map(({ lines, ...r }) => ({ ...r, lines: parseReturnLines(lines) })),
    personalWeapon: kit.personalWeapon ? flattenState(kit.personalWeapon) : null,
  };
}

export type KitDetail = NonNullable<Awaited<ReturnType<typeof getKit>>>;

/** Previous / next *issued* kit numbers, for walking through a מסדר. */
export async function getKitNeighbours(kitNumber: number, platoonId?: string) {
  const { db } = await companyContext();
  const where = { soldierId: { not: null }, ...(platoonId ? { soldier: { platoonId } } : {}) };
  const [prev, next] = await Promise.all([
    db.personalKit.findFirst({
      where: { ...where, kitNumber: { lt: kitNumber } },
      orderBy: { kitNumber: "desc" },
      select: { kitNumber: true },
    }),
    db.personalKit.findFirst({
      where: { ...where, kitNumber: { gt: kitNumber } },
      orderBy: { kitNumber: "asc" },
      select: { kitNumber: true },
    }),
  ]);
  return { prev: prev?.kitNumber ?? null, next: next?.kitNumber ?? null };
}

/** Soldier ids that already hold a kit (other than `exceptKit`). */
export async function getSoldiersWithKit(exceptKit?: number) {
  const { db } = await companyContext();
  const rows = await db.personalKit.findMany({
    where: { soldierId: { not: null }, ...(exceptKit ? { kitNumber: { not: exceptKit } } : {}) },
    select: { soldierId: true, kitNumber: true },
  });
  return new Map(rows.map((r) => [r.soldierId!, r.kitNumber]));
}

/**
 * Serial-numbered items that can be this kit's personal weapon:
 * items already held by the soldier, plus free items (in the armory or stored).
 * Items linked to another kit are excluded.
 */
export async function getWeaponOptions(soldierId: string | null, currentWeaponId: string | null) {
  const { db, deployment } = await companyContext();
  if (!deployment) return [];
  const deploymentId = deployment.id;
  const items = await db.equipmentItem.findMany({
    where: {
      OR: [
        ...(soldierId ? [inState(deploymentId, { soldierId })] : []),
        inState(deploymentId, { soldierId: null, status: { in: ["IN_ARMORY", "STORED"] } }),
        ...(currentWeaponId ? [{ id: currentWeaponId }] : []),
      ],
      AND: [
        // Not already another kit's weapon in this deployment.
        {
          OR: [
            { personalKits: { none: { deploymentId } } },
            ...(currentWeaponId ? [{ id: currentWeaponId }] : []),
          ],
        },
        // Components of a set (e.g. a sight attached to a Negev) can't be a kit's personal weapon.
        { parentId: null },
      ],
    },
    orderBy: [{ category: { name: "asc" } }, { serialNumber: "asc" }],
    take: 300,
    select: { id: true, serialNumber: true, category: { select: { name: true } }, ...stateSelect(deploymentId, { id: true }) },
  });
  return items.map(flattenState).map((i) => ({
    id: i.id,
    serialNumber: i.serialNumber,
    category: i.category.name,
    heldBySoldier: !!soldierId && i.assignedSoldierId === soldierId,
  }));
}

export type WeaponOption = Awaited<ReturnType<typeof getWeaponOptions>>[number];

/**
 * How many kit slots the viewed deployment has: the company's kit count — or, for a closed
 * deployment, as many as it had (the count may have changed since).
 */
export async function getKitSlots() {
  const { user, db, deployment } = await companyContext();
  const company = await db.company.findUnique({ where: { id: user.companyId }, select: { kitCount: true } });
  const count = company?.kitCount ?? 0;
  if (!deployment?.readOnly) return count;
  const last = await db.personalKit.findFirst({ orderBy: { kitNumber: "desc" }, select: { kitNumber: true } });
  return last?.kitNumber ?? count;
}

/** Kit numbers of the viewed deployment that no soldier holds, in order (for issuing a kit). */
export async function getFreeKitNumbers() {
  const { db, deployment } = await companyContext();
  if (!deployment || deployment.readOnly) return [];
  const [slots, taken] = await Promise.all([
    getKitSlots(),
    db.personalKit.findMany({ where: { soldierId: { not: null } }, select: { kitNumber: true } }),
  ]);
  const used = new Set(taken.map((k) => k.kitNumber));
  return Array.from({ length: slots }, (_, i) => i + 1).filter((n) => !used.has(n));
}

/**
 * Company-wide totals per checklist line over the issued kits of the viewed deployment
 * (optionally one platoon): signed for / in the kits / missing (magazines, rounds and drums are
 * checklist lines too), plus what is in returned kits in stock.
 */
export async function getKitSummary(platoonId?: string) {
  await connection();
  const { db, deployment } = await companyContext();
  if (!deployment) return { kits: 0, signedKits: 0, stockKits: 0, partialStock: 0, lines: [], weapons: 0 };
  const [kits, stockKits, partialStock, activeDefs] = await Promise.all([
    db.personalKit.findMany({
      where: { soldierId: { not: null }, ...(platoonId ? { soldier: { platoonId } } : {}) },
      select: { signedAt: true, personalWeaponId: true, ...kitItemsSelect },
    }),
    // Kits in stock whose contents were checked (✓ נבדק — a contents check or a full return): what is
    // really in them. They belong to no platoon.
    platoonId
      ? []
      : db.personalKit.findMany({ where: { soldierId: null, contentsCheckedAt: { not: null } }, select: kitItemsSelect }),
    platoonId ? 0 : db.personalKit.count({ where: { soldierId: null, contentsCheckedAt: null, returns: { some: {} } } }),
    activeItemDefs(db),
  ]);
  const history = !!deployment.readOnly;
  return {
    kits: kits.length,
    signedKits: kits.filter((k) => k.signedAt).length,
    stockKits: stockKits.length,
    /** Returned kits in stock whose contents weren't fully checked — not counted in "במלאי". */
    partialStock,
    lines: summarizeKits([
      ...kits.map((k) => ({ signed: !!k.signedAt, lines: checklistLines(k.items, { history, activeDefs, pakal: k.pakal }) })),
      ...stockKits.map((k) => ({
        signed: false,
        inStock: true,
        lines: checklistLines(k.items, { history, activeDefs, pakal: k.pakal }),
      })),
    ]),
    weapons: kits.filter((k) => k.personalWeaponId).length,
  };
}

export type KitSummary = Awaited<ReturnType<typeof getKitSummary>>;

/** The company's פק"לים with the items they require (for the kit page and /kits/items). */
export async function getPakals() {
  const { db } = await companyContext();
  return db.pakal.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      color: true,
      isActive: true,
      items: { orderBy: { item: { sortOrder: "asc" } }, select: { itemId: true, quantity: true, item: { select: { label: true } } } },
      _count: { select: { kits: true } },
    },
  });
}

export type PakalDetail = Awaited<ReturnType<typeof getPakals>>[number];
