import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { copySetup } from "@/app/admin/companies/actions";
import { loginAs, loginAsSuperAdmin, makeCategory, makeCompany, makeItem } from "./factories";

/** פלוגה ג'-like source: a few types, one set, an extra kit line, one item with a serial. */
async function makeSource() {
  const source = await makeCompany({ name: "מקור" });
  const rifle = await makeCategory({ companyId: source.id, name: "M4", targetQuantity: 90 });
  const sight = await makeCategory({ companyId: source.id, name: "כוונת", targetQuantity: 40 });
  await makeCategory({ companyId: source.id, domain: "AMMUNITION", name: "5.56", minThreshold: 5000 });
  await prisma.equipmentSet.create({
    data: {
      companyId: source.id,
      name: "M4 מלא",
      mainCategoryId: rifle.id,
      slots: { create: [{ companyId: source.id, categoryId: sight.id, quantity: 1, required: true }] },
    },
  });
  await prisma.kitItemDef.create({ data: { companyId: source.id, label: "משקפת לילה", groupName: "ציוד לילה", targetQuantity: 1 } });
  // Already on every company's default list, under another section: must not be added twice.
  await prisma.kitItemDef.updateMany({ where: { companyId: source.id, label: "פנס ראש" }, data: { groupName: "ציוד לילה" } });
  await makeItem({ companyId: source.id, categoryId: rifle.id });
  return source;
}

describe("copy company setup", () => {
  it("copies catalog (with numbers), sets and kit lines — never items", async () => {
    const source = await makeSource();
    const target = await makeCompany({ name: "יעד" });
    await loginAsSuperAdmin(null);

    expect(await copySetup(target.id, source.id)).toMatchObject({ ok: true });

    const types = await prisma.equipmentCategory.findMany({ where: { companyId: target.id }, orderBy: { name: "asc" } });
    expect(types.map((t) => [t.name, t.targetQuantity, t.minThreshold])).toEqual([
      ["5.56", null, 5000],
      ["M4", 90, null],
      ["כוונת", 40, null],
    ]);
    const set = await prisma.equipmentSet.findFirstOrThrow({ where: { companyId: target.id }, include: { slots: true, mainCategory: true } });
    expect(set.name).toBe("M4 מלא");
    expect(set.mainCategory.companyId).toBe(target.id);
    expect(set.slots).toHaveLength(1);
    expect(await prisma.kitItemDef.count({ where: { companyId: target.id, label: "משקפת לילה" } })).toBe(1);
    expect(await prisma.kitItemDef.count({ where: { companyId: target.id, label: "פנס ראש" } })).toBe(1);
    // No items (serials) cross over.
    expect(await prisma.equipmentItem.count({ where: { companyId: target.id } })).toBe(0);
  });

  it("merges: existing types keep their values, and a second run adds nothing", async () => {
    const source = await makeSource();
    const target = await makeCompany({ name: "יעד" });
    await makeCategory({ companyId: target.id, name: "M4", targetQuantity: 12 });
    await loginAsSuperAdmin(null);

    await copySetup(target.id, source.id);
    expect((await prisma.equipmentCategory.findFirstOrThrow({ where: { companyId: target.id, name: "M4" } })).targetQuantity).toBe(12);

    const before = await prisma.equipmentCategory.count({ where: { companyId: target.id } });
    const again = await copySetup(target.id, source.id);
    expect(again.message).toContain("לא נוסף דבר");
    expect(await prisma.equipmentCategory.count({ where: { companyId: target.id } })).toBe(before);
  });

  it("is super-admin only", async () => {
    const source = await makeSource();
    const target = await makeCompany({ name: "יעד" });
    await loginAs("ADMIN", { companyId: target.id });
    await expect(copySetup(target.id, source.id)).rejects.toThrow();
    expect(await prisma.equipmentCategory.count({ where: { companyId: target.id } })).toBe(0);
  });
});
