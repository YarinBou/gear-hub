import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { CrossCompanyError, scopedDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { recordMovement } from "@/app/(app)/ammo/actions";
import { deleteCategory, updateCategory } from "@/app/(app)/catalog/actions";
import {
  assignEquipment,
  attachComponentAction,
  bulkSetPlatoon,
  bulkSetStatus,
  updateDetails,
  verifyEquipment,
} from "@/app/(app)/equipment/actions";
import { assignKit, updateWeapon } from "@/app/(app)/kits/actions";
import { createSoldier, setSoldierActive, updateSoldier } from "@/app/(app)/roster/actions";
import { setUserActive } from "@/app/(app)/users/actions";
import { getDashboardData } from "@/lib/queries/dashboard";
import { getEquipmentCounts, getEquipmentReport, listEquipment } from "@/lib/queries/equipment";
import { getAmmoOverview } from "@/lib/queries/ammo";
import { getStorageOverview } from "@/lib/queries/storage";
import { getSoldierOptions, listSoldiers } from "@/lib/queries/soldiers";
import { listKits } from "@/lib/queries/kits";
import { getActiveCategories } from "@/lib/queries/catalog";
import {
  form,
  loginAs,
  platoonId,
  loginAsSuperAdmin,
  makeAmmoStock,
  makeCategory,
  makeCompany,
  makeItem,
  makeKit,
  makeSoldier,
  makeUser,
  stateOf,
} from "./factories";

// Companies share nothing. Every test sets up two companies with deliberately colliding data
// (same names, serials, kit numbers) and checks that company A can neither see nor touch B.

type World = Awaited<ReturnType<typeof twoCompanies>>;

async function twoCompanies() {
  const a = await makeCompany({ name: "פלוגה א" });
  const b = await makeCompany({ name: "פלוגה ב" });
  const build = async (companyId: string) => {
    const soldier = await makeSoldier({ companyId, name: "ישראל ישראלי", personalNumber: "1234567", platoon: "PLATOON_2" });
    const category = await makeCategory({ companyId, name: "M16" });
    const ammoType = await makeCategory({ companyId, domain: "AMMUNITION", name: "5.56" });
    const item = await makeItem({ companyId, categoryId: category.id, serialNumber: "555" });
    const stock = await makeAmmoStock({ companyId, categoryId: ammoType.id, location: "בונקר", quantity: 100 });
    const kit = await makeKit({ companyId, kitNumber: 1 });
    const user = await makeUser({ companyId, role: "REGULAR" });
    return { soldier, category, ammoType, item, stock, kit, user };
  };
  return { a: { id: a.id, ...(await build(a.id)) }, b: { id: b.id, ...(await build(b.id)) } };
}

let w: World;
beforeEach(async () => {
  w = await twoCompanies();
});

describe("same keys in different companies", () => {
  it("serial, kit number, personal number and catalog name may repeat across companies", () => {
    // twoCompanies() would have thrown on a unique violation.
    expect(w.a.item.serialNumber).toBe(w.b.item.serialNumber);
    expect(w.a.kit.kitNumber).toBe(w.b.kit.kitNumber);
    expect(w.a.soldier.personalNumber).toBe(w.b.soldier.personalNumber);
    expect(w.a.category.name).toBe(w.b.category.name);
  });
});

describe("scopedDb", () => {
  it("never returns another company's rows", async () => {
    const db = scopedDb(w.a.id);
    expect(await db.soldier.findUnique({ where: { id: w.b.soldier.id } })).toBeNull();
    expect(await db.equipmentItem.findFirst({ where: { serialNumber: "555" } })).toMatchObject({ id: w.a.item.id });
    expect((await db.soldier.findMany()).map((s) => s.id)).toEqual([w.a.soldier.id]);
    expect(await db.personalKit.count()).toBe(1);
    const grouped = await db.equipmentAssignment.groupBy({ by: ["status"], _count: { _all: true } });
    expect(grouped).toEqual([{ status: "IN_ARMORY", _count: { _all: 1 } }]);
  });

  it("can't update or delete another company's rows", async () => {
    const db = scopedDb(w.a.id);
    await expect(db.soldier.update({ where: { id: w.b.soldier.id }, data: { name: "x" } })).rejects.toThrow();
    expect((await db.soldier.updateMany({ where: { id: w.b.soldier.id }, data: { name: "x" } })).count).toBe(0);
    expect((await db.equipmentItem.deleteMany({ where: { id: w.b.item.id } })).count).toBe(0);
    expect((await prisma.soldier.findUniqueOrThrow({ where: { id: w.b.soldier.id } })).name).toBe("ישראל ישראלי");
  });

  it("rejects writes that name another company", async () => {
    const db = scopedDb(w.a.id);
    await expect(
      db.soldier.create({ data: { companyId: w.b.id, name: "x", platoonId: await platoonId("HQ", w.b.id) } }),
    ).rejects.toBeInstanceOf(CrossCompanyError);
    await expect(
      db.soldier.update({ where: { id: w.a.soldier.id }, data: { companyId: w.b.id } }),
    ).rejects.toBeInstanceOf(CrossCompanyError);
    await expect(db.soldier.findMany({ where: { companyId: w.b.id } })).rejects.toBeInstanceOf(CrossCompanyError);
  });

  it("scopes interactive transactions too", async () => {
    const db = scopedDb(w.a.id);
    const seen = await db.$transaction((tx) => tx.equipmentItem.findMany({ select: { id: true } }));
    expect(seen).toEqual([{ id: w.a.item.id }]);
  });
});

describe("pages only show the user's company", () => {
  beforeEach(async () => {
    await loginAs("ADMIN", { companyId: w.a.id });
  });

  it("roster, equipment, kits, ammo, storage, catalog, dashboard", async () => {
    expect((await listSoldiers({})).map((s) => s.id)).toEqual([w.a.soldier.id]);
    expect((await getSoldierOptions()).map((s) => s.id)).toEqual([w.a.soldier.id]);
    expect((await listEquipment({})).items.map((i) => i.id)).toEqual([w.a.item.id]);
    expect((await getEquipmentCounts()).total).toBe(1);
    expect((await getEquipmentReport()).flatMap((t) => t.equipmentItems.map((i) => i.id))).toEqual([w.a.item.id]);
    expect((await getActiveCategories("EQUIPMENT")).map((c) => c.id)).toEqual([w.a.category.id]);
    expect((await getAmmoOverview()).flatMap((t) => t.ammoStocks.map((s) => s.id))).toEqual([w.a.stock.id]);
    expect(await getStorageOverview()).toEqual([]);
    const kits = await listKits();
    expect(kits.filter((k) => k.soldier)).toEqual([]);

    const dash = await getDashboardData();
    expect(dash.roster.total).toBe(1);
    expect(dash.equipment.total).toBe(1);
    expect(dash.ammo.types.map((t) => t.quantity)).toEqual([100]);
  });
});

describe("actions refuse another company's records", () => {
  beforeEach(async () => {
    await loginAs("ADMIN", { companyId: w.a.id });
  });

  /** B's item: its link and its state in B's active deployment. */
  const bItem = () => stateOf(w.b.item.id);

  it("equipment: can't assign B's item, or hand A's item to B's soldier", async () => {
    expect(await assignEquipment(w.b.item.id, undefined, form({ soldierId: w.a.soldier.id }))).toHaveProperty("error");
    expect((await bItem()).assignedSoldierId).toBeNull();

    expect(await assignEquipment(w.a.item.id, undefined, form({ soldierId: w.b.soldier.id }))).toHaveProperty("error");
    expect((await stateOf(w.a.item.id)).assignedSoldierId).toBeNull();
  });

  it("equipment: can't move A's item to B's category, or attach B's item", async () => {
    const res = await updateDetails(w.a.item.id, undefined, form({ categoryId: w.b.category.id, serialNumber: "555" }));
    expect(res).toHaveProperty("errors.categoryId");
    expect(await attachComponentAction(w.a.item.id, w.b.item.id)).toMatchObject({ ok: false });
    expect((await bItem()).parentId).toBeNull();
  });

  it("equipment: bulk actions skip B's ids", async () => {
    await verifyEquipment([w.b.item.id]);
    await bulkSetStatus([w.b.item.id], "MISSING");
    await bulkSetPlatoon([w.b.item.id], await platoonId("HQ", w.a.id));
    expect(await bItem()).toMatchObject({ status: "IN_ARMORY", platoon: null, lastVerifiedAt: null });
  });

  it("kits: can't give A's kit to B's soldier or link B's rifle", async () => {
    expect(await assignKit(1, undefined, form({ soldierId: w.b.soldier.id }))).toHaveProperty("error");

    await assignKit(1, undefined, form({ soldierId: w.a.soldier.id }));
    expect(await updateWeapon(1, undefined, form({ personalWeaponId: w.b.item.id }))).toHaveProperty("error");
    expect((await bItem()).assignedSoldierId).toBeNull();
    // B's kit #1 is untouched.
    expect((await prisma.personalKit.findUniqueOrThrow({ where: { id: w.b.kit.id } })).soldierId).toBeNull();
  });

  it("ammo: can't record a movement on B's stock", async () => {
    expect(await recordMovement(w.b.stock.id, undefined, form({ type: "ISSUE", amount: 10 }))).toHaveProperty("error");
    expect((await prisma.ammoStock.findUniqueOrThrow({ where: { id: w.b.stock.id } })).quantity).toBe(100);
  });

  it("roster: can't edit or remove B's soldier", async () => {
    expect(
      await updateSoldier(w.b.soldier.id, undefined, form({ name: "שונה", platoon: await platoonId("HQ", w.a.id) })),
    ).toHaveProperty("errors");
    expect(await setSoldierActive(w.b.soldier.id, false, undefined, form({}))).toHaveProperty("error");
    expect(await prisma.soldier.findUniqueOrThrow({ where: { id: w.b.soldier.id } })).toMatchObject({
      name: "ישראל ישראלי",
      isActive: true,
    });
  });

  it("platoons: A can't put its soldiers or equipment in B's platoon", async () => {
    const bHq = await platoonId("HQ", w.b.id);
    expect(await createSoldier(undefined, form({ name: "חדש", platoon: bHq }))).toHaveProperty("errors.platoon");
    expect(await updateSoldier(w.a.soldier.id, undefined, form({ name: "ישראל ישראלי", platoon: bHq }))).toHaveProperty("errors.platoon");
    expect((await prisma.soldier.findUniqueOrThrow({ where: { id: w.a.soldier.id } })).platoonId).toBe(await platoonId("PLATOON_2", w.a.id));

    expect(await bulkSetPlatoon([w.a.item.id], bHq)).toMatchObject({ ok: false });
    expect(await assignEquipment(w.a.item.id, undefined, form({ platoon: bHq }))).toHaveProperty("error");
    expect(await prisma.equipmentAssignment.count({ where: { platoonId: bHq, companyId: w.a.id } })).toBe(0);
  });

  it("catalog: can't edit or delete B's types", async () => {
    expect(await updateCategory(w.b.category.id, undefined, form({ name: "שונה" }))).toHaveProperty("error");
    expect(await deleteCategory(w.b.ammoType.id)).toMatchObject({ ok: false });
    expect(await prisma.equipmentCategory.count({ where: { companyId: w.b.id } })).toBe(2);
  });

  it("users: can't deactivate B's user", async () => {
    await expect(setUserActive(w.b.user.id, false)).rejects.toThrow();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.b.user.id } })).isActive).toBe(true);
  });
});

describe("who can get in", () => {
  it("a user of a deactivated company is signed out", async () => {
    await loginAs("ADMIN", { companyId: w.a.id });
    await prisma.company.update({ where: { id: w.a.id }, data: { isActive: false } });
    await expect(requireUser()).rejects.toMatchObject({ url: "/login" });
  });

  it("a SUPER_ADMIN must pick a company first, then sees only that one", async () => {
    await loginAsSuperAdmin(null);
    await expect(requireUser()).rejects.toMatchObject({ url: "/admin/companies" });

    await loginAsSuperAdmin(w.b.id);
    expect((await listSoldiers({})).map((s) => s.id)).toEqual([w.b.soldier.id]);
  });

  it("a forged company cookie doesn't work for a regular user", async () => {
    await loginAs("ADMIN", { companyId: w.a.id });
    const { chooseCompany } = await import("./auth-mock");
    chooseCompany(w.b.id); // only SUPER_ADMIN sessions read this cookie
    expect((await requireUser()).companyId).toBe(w.a.id);
  });

  it("the database refuses a non-super-admin user without a company", async () => {
    await expect(
      prisma.user.create({ data: { username: "orphan", name: "x", passwordHash: "x", role: "ADMIN", companyId: null } }),
    ).rejects.toThrow();
  });
});
