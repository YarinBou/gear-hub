import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createPlatoon, deletePlatoon, renamePlatoon, setPlatoonActive, setPlatoonCount } from "@/app/(app)/platoons/actions";
import { importSoldiers } from "@/app/(app)/roster/actions";
import { assignEquipment } from "@/app/(app)/equipment/actions";
import { form, homeCompany, loginAs, makeItem, makeSoldier, platoonId } from "./factories";

// Platoons (מחלקות) are per-company rows: any number, any names, managed by admins.

const activeNames = async () =>
  (await prisma.platoon.findMany({ where: { companyId: await homeCompany(), isActive: true }, orderBy: { sortOrder: "asc" } })).map((p) => p.name);

describe("managing platoons", () => {
  it("an admin sets the number of platoons and renames them", async () => {
    await loginAs("ADMIN");
    expect(await setPlatoonCount(6)).toMatchObject({ ok: true });
    expect(await activeNames()).toEqual(["מחלקה 1", "מחלקה 2", "מחלקה 3", 'חפ"ק ומפל"ג', "מחלקה 4", "מחלקה 5"]);

    const id = await platoonId("PLATOON_1");
    expect(await renamePlatoon(id, "  צוות   1 ")).toMatchObject({ ok: true });
    expect((await prisma.platoon.findUniqueOrThrow({ where: { id } })).name).toBe("צוות 1");
    expect(await renamePlatoon(id, "מחלקה 2")).toMatchObject({ ok: false });

    expect(await createPlatoon("חוד")).toMatchObject({ ok: true });
    expect(await activeNames()).toContain("חוד");
  });

  it("shrinking refuses platoons with soldiers, deactivates ones with history, deletes unused ones", async () => {
    await loginAs("ADMIN");
    const soldier = await makeSoldier({ platoon: "HQ" });
    expect(await setPlatoonCount(2)).toMatchObject({ ok: false });
    expect(await activeNames()).toHaveLength(4);

    // Move the soldier out; give מחלקה 3 some equipment history.
    await prisma.soldier.update({ where: { id: soldier.id }, data: { platoonId: await platoonId("PLATOON_1") } });
    const item = await makeItem();
    await assignEquipment(item.id, undefined, form({ platoon: await platoonId("PLATOON_3") }));

    expect(await setPlatoonCount(2)).toMatchObject({ ok: true });
    expect(await activeNames()).toEqual(["מחלקה 1", "מחלקה 2"]);
    const rest = await prisma.platoon.findMany({ where: { companyId: await homeCompany(), isActive: false } });
    expect(rest.map((p) => p.name)).toEqual(["מחלקה 3"]); // kept (history); חפ"ק deleted
  });

  it("can't deactivate a platoon with soldiers or delete one in use; a regular user can't manage", async () => {
    await loginAs("ADMIN");
    await makeSoldier({ platoon: "PLATOON_2" });
    const p2 = await platoonId("PLATOON_2");
    expect(await setPlatoonActive(p2, false)).toMatchObject({ ok: false });
    expect(await deletePlatoon(p2)).toMatchObject({ ok: false });
    expect(await deletePlatoon(await platoonId("PLATOON_3"))).toMatchObject({ ok: true });

    await loginAs("REGULAR");
    await expect(setPlatoonCount(8)).rejects.toThrow();
  });
});

describe("importing a roster with custom platoon names", () => {
  it("matches the names in the pasted column", async () => {
    await loginAs("ADMIN");
    await renamePlatoon(await platoonId("PLATOON_1"), "צוות 1");
    await renamePlatoon(await platoonId("PLATOON_2"), "צוות 2");
    await renamePlatoon(await platoonId("HQ"), "מפלג");

    const text = ["טל אברהם\t9274233\t\t\t1", "דוד רעי\t8243985\t\t\tמפלג", "נועם גדות\t5917012\t\t\tצוות 2", "x y\t1111111\t\t\t9"].join("\n");
    const r = await importSoldiers(undefined, form({ text }));
    expect(r).toMatchObject({ created: 3 });
    expect(r?.skipped).toHaveLength(1);

    const byName = async (name: string) =>
      (await prisma.soldier.findFirstOrThrow({ where: { name }, select: { platoon: { select: { name: true } } } })).platoon.name;
    expect(await byName("טל אברהם")).toBe("צוות 1");
    expect(await byName("דוד רעי")).toBe("מפלג");
    expect(await byName("נועם גדות")).toBe("צוות 2");
  });
});
