import { prisma } from "@/lib/prisma";
import type { CatalogDomain, EquipmentStatus, Platoon, Role } from "@/generated/prisma/enums";
import { signInAs, type TestUser } from "./auth-mock";

// Minimal builders for integration tests. When the schema gains companyId / deploymentId,
// this file is the one place that has to learn about them.

let seq = 0;
const next = () => ++seq;

export async function makeUser(opts: { role?: Role; platoon?: Platoon | null; name?: string } = {}): Promise<TestUser> {
  const n = next();
  return prisma.user.create({
    data: {
      username: `user${n}`,
      name: opts.name ?? `משתמש ${n}`,
      passwordHash: "x",
      role: opts.role ?? "REGULAR",
      platoon: opts.platoon ?? null,
    },
    select: { id: true, name: true, username: true, role: true, platoon: true, isActive: true },
  });
}

/** Create a user and make them the "logged in" user for server actions. */
export async function loginAs(role: Role = "ADMIN") {
  const user = await makeUser({ role });
  signInAs(user);
  return user;
}

export async function makeSoldier(opts: { platoon?: Platoon; isActive?: boolean; name?: string; personalNumber?: string } = {}) {
  const n = next();
  return prisma.soldier.create({
    data: {
      name: opts.name ?? `לוחם ${n}`,
      platoon: opts.platoon ?? "PLATOON_1",
      isActive: opts.isActive ?? true,
      personalNumber: opts.personalNumber ?? null,
    },
  });
}

export async function makeCategory(opts: { domain?: CatalogDomain; name?: string; targetQuantity?: number; minThreshold?: number } = {}) {
  const n = next();
  return prisma.equipmentCategory.create({
    data: {
      domain: opts.domain ?? "EQUIPMENT",
      name: opts.name ?? `סוג ${n}`,
      targetQuantity: opts.targetQuantity,
      minThreshold: opts.minThreshold,
    },
  });
}

export async function makeItem(opts: {
  categoryId?: string;
  serialNumber?: string | null;
  status?: EquipmentStatus;
  assignedSoldierId?: string | null;
  platoon?: Platoon | null;
  parentId?: string | null;
} = {}) {
  const categoryId = opts.categoryId ?? (await makeCategory()).id;
  return prisma.equipmentItem.create({
    data: {
      categoryId,
      serialNumber: opts.serialNumber === undefined ? `SN${next()}` : opts.serialNumber,
      status: opts.status ?? "IN_ARMORY",
      assignedSoldierId: opts.assignedSoldierId ?? null,
      platoon: opts.platoon ?? null,
      parentId: opts.parentId ?? null,
    },
  });
}

export async function makeAmmoStock(opts: { categoryId?: string; location?: string; quantity?: number } = {}) {
  const categoryId = opts.categoryId ?? (await makeCategory({ domain: "AMMUNITION" })).id;
  return prisma.ammoStock.create({
    data: { categoryId, location: opts.location ?? `מיקום ${next()}`, quantity: opts.quantity ?? 0 },
  });
}

/** Build a FormData from a plain object (what a <form> submits to a server action). */
export function form(values: Record<string, string | number | undefined | null>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) if (v != null) fd.set(k, String(v));
  return fd;
}
