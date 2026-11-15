import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { deleteSet, saveSet } from "@/app/(app)/catalog/sets/actions";
import { assignEquipment, signSetAction, updateDetails } from "@/app/(app)/equipment/actions";
import { getEquipmentCounts, listEquipment } from "@/lib/queries/equipment";
import { form, loginAs, makeCategory, makeCompany, makeItem, makeSoldier, stateOf } from "./factories";

// Equipment sets (מארזים): defined by admins, used when signing equipment out.

async function negevSet() {
  const negev = await makeCategory({ name: "נגב" });
  const kansap = await makeCategory({ name: 'קנס"פ' });
  const laser = await makeCategory({ name: "ציין" });
  const adapter = await makeCategory({ name: "מתאם" });
  const r = await saveSet(null, {
    name: "מארז נגב",
    mainCategoryId: negev.id,
    slots: [
      { categoryId: kansap.id, quantity: 1, required: true },
      { categoryId: laser.id, quantity: 1, required: true },
      { categoryId: adapter.id, quantity: 1, required: false },
    ],
  });
  expect(r).toMatchObject({ ok: true });
  const set = await prisma.equipmentSet.findFirstOrThrow({ where: { name: "מארז נגב" } });
  return { set, negev, kansap, laser, adapter };
}

describe("defining sets", () => {
  it("an admin saves a set with its lines, and can replace them", async () => {
    await loginAs("ADMIN");
    const { set, adapter } = await negevSet();
    expect(await prisma.equipmentSetSlot.count({ where: { setId: set.id } })).toBe(3);

    const r = await saveSet(set.id, {
      name: "מארז נגב",
      mainCategoryId: set.mainCategoryId,
      slots: [{ categoryId: adapter.id, quantity: 2, required: true }],
    });
    expect(r).toMatchObject({ ok: true });
    const slots = await prisma.equipmentSetSlot.findMany({ where: { setId: set.id } });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ categoryId: adapter.id, quantity: 2, required: true });
  });

  it("refuses a duplicate name and another company's types", async () => {
    await loginAs("ADMIN");
    const { negev, kansap } = await negevSet();
    const dup = await saveSet(null, { name: "מארז נגב", mainCategoryId: negev.id, slots: [{ categoryId: kansap.id, quantity: 1, required: true }] });
    expect(dup.errors?.name).toBeTruthy();

    const other = await makeCompany({ name: "פלוגה אחרת" });
    const foreign = await makeCategory({ companyId: other.id });
    const r = await saveSet(null, { name: "זר", mainCategoryId: negev.id, slots: [{ categoryId: foreign.id, quantity: 1, required: true }] });
    expect(r.ok).toBe(false);
  });

  it("a regular user can't define sets", async () => {
    await loginAs("ADMIN");
    const { negev, kansap } = await negevSet();
    await loginAs("REGULAR");
    await expect(
      saveSet(null, { name: "x", mainCategoryId: negev.id, slots: [{ categoryId: kansap.id, quantity: 1, required: true }] }),
    ).rejects.toThrow();
  });
});

describe("signing a set out", () => {
  it("assigns the main item, attaches and creates components, and flags what's missing", async () => {
    await loginAs("ADMIN");
    const { set, negev, laser, adapter } = await negevSet();
    await loginAs("REGULAR"); // signing out is not admin-only
    const soldier = await makeSoldier({ platoon: "PLATOON_2" });
    const gun = await makeItem({ categoryId: negev.id });
    const pointer = await makeItem({ categoryId: laser.id });

    // ציין from the armory, the optional מתאם created "ללא צ", the required קנס"פ not issued.
    const r = await signSetAction({
      setId: set.id,
      soldierId: soldier.id,
      mainItemId: gun.id,
      componentIds: [pointer.id],
      newComponentCategoryIds: [adapter.id],
    });
    expect(r).toMatchObject({ ok: true, itemId: gun.id });

    expect(await stateOf(gun.id)).toMatchObject({ assignedSoldierId: soldier.id, status: "WITH_SOLDIER", platoon: "PLATOON_2" });
    expect(await stateOf(pointer.id)).toMatchObject({ parentId: gun.id, assignedSoldierId: soldier.id, status: "WITH_SOLDIER" });
    const created = await prisma.equipmentItem.findFirstOrThrow({ where: { parentId: gun.id, categoryId: adapter.id } });
    expect(created.serialNumber).toBeNull();
    expect(await stateOf(created.id)).toMatchObject({ assignedSoldierId: soldier.id, status: "WITH_SOLDIER" });
    expect((await prisma.equipmentItem.findUniqueOrThrow({ where: { id: gun.id } })).setId).toBe(set.id);

    // Soft enforcement: signed out, but flagged as missing its קנס"פ.
    const { items } = await listEquipment({ setMissing: true });
    expect(items.map((i) => i.id)).toEqual([gun.id]);
    expect(items[0].setMissing).toBe('קנס"פ');
    expect((await getEquipmentCounts()).setMissing).toBe(1);

    // Returning the main item returns the whole set.
    await assignEquipment(gun.id, undefined, form({ soldierId: "" }));
    for (const id of [gun.id, pointer.id, created.id]) {
      expect(await stateOf(id)).toMatchObject({ assignedSoldierId: null, status: "IN_ARMORY" });
    }
  });

  it("is all or nothing: a component held by someone else stops the whole sign-out", async () => {
    await loginAs("ADMIN");
    const { set, negev, laser, kansap } = await negevSet();
    const [soldier, other] = [await makeSoldier(), await makeSoldier()];
    const gun = await makeItem({ categoryId: negev.id });
    const held = await makeItem({ categoryId: laser.id, assignedSoldierId: other.id, status: "WITH_SOLDIER" });

    const r = await signSetAction({
      setId: set.id,
      soldierId: soldier.id,
      mainItemId: gun.id,
      componentIds: [held.id],
      newComponentCategoryIds: [kansap.id],
    });
    expect(r.ok).toBe(false);
    expect(await stateOf(gun.id)).toMatchObject({ assignedSoldierId: null, status: "IN_ARMORY" });
    expect(await prisma.equipmentItem.count({ where: { parentId: gun.id } })).toBe(0);
  });

  it("refuses a main item of the wrong type", async () => {
    await loginAs("ADMIN");
    const { set, laser } = await negevSet();
    const soldier = await makeSoldier();
    const notAGun = await makeItem({ categoryId: laser.id });
    const r = await signSetAction({ setId: set.id, soldierId: soldier.id, mainItemId: notAGun.id, componentIds: [], newComponentCategoryIds: [] });
    expect(r.ok).toBe(false);
  });

  it("changing the main item's type drops its set; a set in use can't be deleted", async () => {
    await loginAs("ADMIN");
    const { set, negev, laser } = await negevSet();
    const soldier = await makeSoldier();
    const gun = await makeItem({ categoryId: negev.id });
    expect((await signSetAction({ setId: set.id, soldierId: soldier.id, mainItemId: gun.id, componentIds: [], newComponentCategoryIds: [] })).ok).toBe(true);

    expect((await deleteSet(set.id)).ok).toBe(false);

    await updateDetails(gun.id, undefined, form({ categoryId: laser.id, serialNumber: gun.serialNumber }));
    expect((await prisma.equipmentItem.findUniqueOrThrow({ where: { id: gun.id } })).setId).toBeNull();
  });
});
