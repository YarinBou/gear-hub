import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assignEquipment, attachComponentAction, bulkSetStatus } from "@/app/(app)/equipment/actions";
import { form, loginAs, makeCategory, makeItem, makeSoldier, stateOf } from "./factories";

// Current behaviour of equipment moves (צל"ם). These must stay green through the multi-company
// and deployment refactor — only the setup in factories.ts should need to change.

/** The item's state in the active deployment. */
const item = (id: string) => stateOf(id);

describe("assigning equipment", () => {
  it("handing an armory item to a soldier sets holder, status, platoon and logs it", async () => {
    const user = await loginAs("REGULAR");
    const soldier = await makeSoldier({ platoon: "PLATOON_2" });
    const rifle = await makeItem();

    const res = await assignEquipment(rifle.id, undefined, form({ soldierId: soldier.id }));
    expect(res).toMatchObject({ ok: true });

    expect(await item(rifle.id)).toMatchObject({
      assignedSoldierId: soldier.id,
      status: "WITH_SOLDIER",
      platoon: "PLATOON_2",
    });
    const logs = await prisma.equipmentLog.findMany({ where: { itemId: rifle.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ toSoldierId: soldier.id, fromStatus: "IN_ARMORY", toStatus: "WITH_SOLDIER", performedById: user.id });
  });

  it("returning it puts it back in the armory", async () => {
    await loginAs();
    const soldier = await makeSoldier();
    const rifle = await makeItem({ assignedSoldierId: soldier.id, status: "WITH_SOLDIER", platoon: "PLATOON_1" });

    await assignEquipment(rifle.id, undefined, form({ soldierId: "" }));
    expect(await item(rifle.id)).toMatchObject({ assignedSoldierId: null, status: "IN_ARMORY" });
  });

  it("refuses a soldier who left the roster", async () => {
    await loginAs();
    const gone = await makeSoldier({ isActive: false });
    const rifle = await makeItem();
    const res = await assignEquipment(rifle.id, undefined, form({ soldierId: gone.id }));
    expect(res).toHaveProperty("error");
    expect(await item(rifle.id)).toMatchObject({ assignedSoldierId: null });
  });

  it("requires a login", async () => {
    const rifle = await makeItem();
    await expect(assignEquipment(rifle.id, undefined, form({}))).rejects.toThrow(/login/);
  });
});

describe("linked sets", () => {
  it("components follow the parent and can't be moved alone", async () => {
    await loginAs();
    const soldier = await makeSoldier({ platoon: "PLATOON_3" });
    const negev = await makeItem();
    const sight = await makeItem();

    expect(await attachComponentAction(negev.id, sight.id)).toMatchObject({ ok: true });

    await assignEquipment(negev.id, undefined, form({ soldierId: soldier.id }));
    expect(await item(sight.id)).toMatchObject({ assignedSoldierId: soldier.id, status: "WITH_SOLDIER", platoon: "PLATOON_3" });

    const alone = await assignEquipment(sight.id, undefined, form({ soldierId: "" }));
    expect(alone).toHaveProperty("error");
  });

  it("attaching a piece held by another soldier asks first, then moves it per the choice", async () => {
    await loginAs();
    const [a, b] = [await makeSoldier({ name: "א" }), await makeSoldier({ name: "ב" })];
    const negev = await makeItem({ assignedSoldierId: a.id, status: "WITH_SOLDIER" });
    const sight = await makeItem({ assignedSoldierId: b.id, status: "WITH_SOLDIER" });

    // First try: nothing moves, the conflict comes back.
    const first = await attachComponentAction(negev.id, sight.id);
    expect(first).toMatchObject({ ok: false, conflict: { holder: { id: b.id }, parentHolder: { id: a.id } } });
    expect((await prisma.equipmentItem.findUniqueOrThrow({ where: { id: sight.id } })).parentId).toBeNull();

    // "takeOver": the piece moves to the main item's holder.
    expect(await attachComponentAction(negev.id, sight.id, "takeOver")).toMatchObject({ ok: true });
    expect(await item(sight.id)).toMatchObject({ assignedSoldierId: a.id });
  });

  it("'moveSet' signs the main item (and the set) over to the piece's holder", async () => {
    await loginAs();
    const b = await makeSoldier();
    const negev = await makeItem();
    const sight = await makeItem({ assignedSoldierId: b.id, status: "WITH_SOLDIER" });

    expect(await attachComponentAction(negev.id, sight.id)).toMatchObject({ ok: false, conflict: { parentHolder: null } });
    expect(await attachComponentAction(negev.id, sight.id, "moveSet")).toMatchObject({ ok: true });
    expect(await item(negev.id)).toMatchObject({ assignedSoldierId: b.id, status: "WITH_SOLDIER" });
    expect(await item(sight.id)).toMatchObject({ assignedSoldierId: b.id });
  });

  it("bulk status skips components but moves them with their parent", async () => {
    await loginAs();
    const negev = await makeItem();
    const sight = await makeItem({ parentId: negev.id });

    const res = await bulkSetStatus([negev.id, sight.id], "IN_REPAIR");
    expect(res.ok).toBe(true);
    expect((await item(negev.id)).status).toBe("IN_REPAIR");
    expect((await item(sight.id)).status).toBe("IN_REPAIR");
  });
});

describe("uniqueness within a company", () => {
  it("rejects a duplicate serial in the same company", async () => {
    const cat = await makeCategory();
    await makeItem({ categoryId: cat.id, serialNumber: "123" });
    await expect(makeItem({ categoryId: cat.id, serialNumber: "123" })).rejects.toThrow();
  });
});
