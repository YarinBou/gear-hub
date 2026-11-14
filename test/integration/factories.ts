import { prisma } from "@/lib/prisma";
import type { CatalogDomain, EquipmentStatus, Platoon, Role } from "@/generated/prisma/enums";
import { chooseCompany, signInAs } from "./auth-mock";

// Minimal builders for integration tests. Everything belongs to a company: by default the test's
// "home" company (created on first use), or the one passed as `companyId`.

let seq = 0;
const next = () => ++seq;

let homeCompanyId: string | null = null;

/** Called before each test (the database is emptied then). */
export function resetFactories() {
  homeCompanyId = null;
}

export async function makeCompany(opts: { name?: string; isActive?: boolean } = {}) {
  return prisma.company.create({ data: { name: opts.name ?? `פלוגה ${next()}`, isActive: opts.isActive ?? true } });
}

/** The default company for factories that aren't given a companyId. */
export async function homeCompany() {
  if (!homeCompanyId) homeCompanyId = (await makeCompany({ name: "פלוגת בית" })).id;
  return homeCompanyId;
}

const companyOf = async (companyId?: string) => companyId ?? (await homeCompany());

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
  return prisma.equipmentItem.create({
    data: {
      companyId,
      categoryId,
      serialNumber: opts.serialNumber === undefined ? `SN${next()}` : opts.serialNumber,
      status: opts.status ?? "IN_ARMORY",
      assignedSoldierId: opts.assignedSoldierId ?? null,
      platoon: opts.platoon ?? null,
      parentId: opts.parentId ?? null,
    },
  });
}

export async function makeAmmoStock(opts: { categoryId?: string; location?: string; quantity?: number; companyId?: string } = {}) {
  const companyId = await companyOf(opts.companyId);
  const categoryId = opts.categoryId ?? (await makeCategory({ domain: "AMMUNITION", companyId })).id;
  return prisma.ammoStock.create({
    data: { companyId, categoryId, location: opts.location ?? `מיקום ${next()}`, quantity: opts.quantity ?? 0 },
  });
}

export async function makeKit(opts: { kitNumber: number; soldierId?: string | null; companyId?: string }) {
  return prisma.personalKit.create({
    data: { companyId: await companyOf(opts.companyId), kitNumber: opts.kitNumber, soldierId: opts.soldierId ?? null },
  });
}

/** Build a FormData from a plain object (what a <form> submits to a server action). */
export function form(values: Record<string, string | number | undefined | null>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) if (v != null) fd.set(k, String(v));
  return fd;
}
