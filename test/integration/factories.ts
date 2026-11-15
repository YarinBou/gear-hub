import { prisma } from "@/lib/prisma";
import type { CatalogDomain, EquipmentStatus, Platoon, Role } from "@/generated/prisma/enums";
import { chooseCompany, signInAs } from "./auth-mock";
import { DEFAULT_KIT_ITEMS } from "@/lib/kit";

// Minimal builders for integration tests. Everything belongs to a company: by default the test's
// "home" company (created on first use), or the one passed as `companyId`. Deployment-level rows
// (item state, kits, ammo) go into the company's ACTIVE deployment, which is created on first use.

let seq = 0;
const next = () => ++seq;

let homeCompanyId: string | null = null;

/** Called before each test (the database is emptied then). */
export function resetFactories() {
  homeCompanyId = null;
}

/** A company with the default personal-kit checklist (as a real new company gets). */
export async function makeCompany(opts: { name?: string; isActive?: boolean; kitDefaultPresent?: boolean } = {}) {
  const company = await prisma.company.create({
    data: { name: opts.name ?? `פלוגה ${next()}`, isActive: opts.isActive ?? true, kitDefaultPresent: opts.kitDefaultPresent ?? false },
  });
  await prisma.kitItemDef.createMany({
    data: DEFAULT_KIT_ITEMS.map((item, i) => ({ companyId: company.id, sortOrder: (i + 1) * 10, ...item })),
  });
  return company;
}

/** A checklist item of the company, by its name (e.g. "קסדה"). */
export async function kitItemId(label: string, companyId?: string) {
  const def = await prisma.kitItemDef.findFirstOrThrow({ where: { companyId: await companyOf(companyId), label } });
  return def.id;
}

/** A kit's checklist row for one item (by name). */
export async function kitLine(kitId: string, label: string) {
  const kit = await prisma.personalKit.findUniqueOrThrow({ where: { id: kitId }, select: { companyId: true } });
  return prisma.kitItemStatus.findUnique({
    where: { kitId_itemId: { kitId, itemId: await kitItemId(label, kit.companyId) } },
  });
}

/** The default company for factories that aren't given a companyId. */
export async function homeCompany() {
  if (!homeCompanyId) homeCompanyId = (await makeCompany({ name: "פלוגת בית" })).id;
  return homeCompanyId;
}

const companyOf = async (companyId?: string) => companyId ?? (await homeCompany());

export async function makeDeployment(opts: { companyId?: string; name?: string; status?: "ACTIVE" | "CLOSED" } = {}) {
  const companyId = await companyOf(opts.companyId);
  const status = opts.status ?? "ACTIVE";
  return prisma.deployment.create({
    data: {
      companyId,
      name: opts.name ?? `הפעלה ${next()}`,
      status,
      activeCompanyId: status === "ACTIVE" ? companyId : null,
      endedAt: status === "CLOSED" ? new Date() : null,
    },
  });
}

/** The company's active deployment (created if it has none). */
export async function activeDeployment(companyId?: string) {
  const id = await companyOf(companyId);
  const existing = await prisma.deployment.findFirst({ where: { companyId: id, status: "ACTIVE" } });
  return existing ?? makeDeployment({ companyId: id });
}

/** An item's state in a deployment (default: its company's active one), shaped like items used to be. */
export async function stateOf(itemId: string, deploymentId?: string) {
  const item = await prisma.equipmentItem.findUniqueOrThrow({ where: { id: itemId }, select: { companyId: true, parentId: true } });
  const depId = deploymentId ?? (await activeDeployment(item.companyId)).id;
  const row = await prisma.equipmentAssignment.findUnique({ where: { deploymentId_itemId: { deploymentId: depId, itemId } } });
  return {
    parentId: item.parentId,
    assignedSoldierId: row?.soldierId ?? null,
    status: row?.status ?? "IN_ARMORY",
    platoon: row?.platoon ?? null,
    lastVerifiedAt: row?.lastVerifiedAt ?? null,
  };
}

export async function makeUser(opts: { role?: Role; platoon?: Platoon | null; name?: string; companyId?: string } = {}) {
  const n = next();
  const role = opts.role ?? "REGULAR";
  return prisma.user.create({
    data: {
      companyId: role === "SUPER_ADMIN" ? null : await companyOf(opts.companyId),
      username: `user${n}`,
      name: opts.name ?? `משתמש ${n}`,
      passwordHash: "x",
      role,
      platoon: opts.platoon ?? null,
    },
    select: { id: true, name: true, username: true, role: true, platoon: true, isActive: true, companyId: true },
  });
}

/** Create a user and sign them in (a real signed session cookie) for server actions. */
export async function loginAs(role: Role = "ADMIN", opts: { companyId?: string } = {}) {
  const user = await makeUser({ role, companyId: opts.companyId });
  await signInAs(user);
  return user;
}

/** Sign in as a SUPER_ADMIN working inside `companyId` (or none). */
export async function loginAsSuperAdmin(companyId: string | null) {
  const user = await makeUser({ role: "SUPER_ADMIN" });
  await signInAs(user);
  chooseCompany(companyId);
  return user;
}

export async function makeSoldier(
  opts: { platoon?: Platoon; isActive?: boolean; name?: string; personalNumber?: string; companyId?: string } = {},
) {
  const n = next();
  return prisma.soldier.create({
    data: {
      companyId: await companyOf(opts.companyId),
      name: opts.name ?? `לוחם ${n}`,
      platoon: opts.platoon ?? "PLATOON_1",
      isActive: opts.isActive ?? true,
      personalNumber: opts.personalNumber ?? null,
    },
  });
}

export async function makeCategory(
  opts: { domain?: CatalogDomain; name?: string; targetQuantity?: number; minThreshold?: number; companyId?: string } = {},
) {
  const n = next();
  return prisma.equipmentCategory.create({
    data: {
      companyId: await companyOf(opts.companyId),
      domain: opts.domain ?? "EQUIPMENT",
      name: opts.name ?? `סוג ${n}`,
      targetQuantity: opts.targetQuantity,
      minThreshold: opts.minThreshold,
    },
  });
}

export async function makeItem(
  opts: {
    categoryId?: string;
    serialNumber?: string | null;
    status?: EquipmentStatus;
    assignedSoldierId?: string | null;
    platoon?: Platoon | null;
    parentId?: string | null;
    companyId?: string;
  } = {},
) {
  const companyId = await companyOf(opts.companyId);
  const categoryId = opts.categoryId ?? (await makeCategory({ companyId })).id;
  const deployment = await activeDeployment(companyId);
  return prisma.equipmentItem.create({
    data: {
      companyId,
      categoryId,
      serialNumber: opts.serialNumber === undefined ? `SN${next()}` : opts.serialNumber,
      parentId: opts.parentId ?? null,
      assignments: {
        create: {
          companyId,
          deploymentId: deployment.id,
          status: opts.status ?? "IN_ARMORY",
          soldierId: opts.assignedSoldierId ?? null,
          platoon: opts.platoon ?? null,
        },
      },
    },
  });
}

export async function makeAmmoStock(opts: { categoryId?: string; location?: string; quantity?: number; companyId?: string } = {}) {
  const companyId = await companyOf(opts.companyId);
  const categoryId = opts.categoryId ?? (await makeCategory({ domain: "AMMUNITION", companyId })).id;
  const deployment = await activeDeployment(companyId);
  return prisma.ammoStock.create({
    data: {
      companyId,
      deploymentId: deployment.id,
      categoryId,
      location: opts.location ?? `מיקום ${next()}`,
      quantity: opts.quantity ?? 0,
    },
  });
}

export async function makeKit(opts: { kitNumber: number; soldierId?: string | null; companyId?: string }) {
  const companyId = await companyOf(opts.companyId);
  const deployment = await activeDeployment(companyId);
  return prisma.personalKit.create({
    data: { companyId, deploymentId: deployment.id, kitNumber: opts.kitNumber, soldierId: opts.soldierId ?? null },
  });
}

/** Build a FormData from a plain object (what a <form> submits to a server action). */
export function form(values: Record<string, string | number | undefined | null>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) if (v != null) fd.set(k, String(v));
  return fd;
}
