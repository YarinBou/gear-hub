import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createCategory, updateCategory } from "@/app/(app)/catalog/actions";
import { createEquipment, setItemAttributes } from "@/app/(app)/equipment/actions";
import { getEquipmentCounts, getEquipmentItem, getEquipmentReport, listEquipment } from "@/lib/queries/equipment";
import { RedirectSignal } from "./auth-mock";
import { activeDeployment, form, loginAs, makeItem } from "./factories";

const LASER = [
  { key: "case", label: "קייס", kind: "check" },
  { key: "ptt", label: "שלט PTT", kind: "check" },
];

describe("equipment properties", () => {
  it("an admin defines them on the type; items are added and marked with them; changes are logged", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    expect(await createCategory("EQUIPMENT", undefined, form({ name: "ציין לייזר", attributes: JSON.stringify(LASER) }))).toMatchObject({ ok: true });
    const laser = await prisma.equipmentCategory.findFirstOrThrow({ where: { name: "ציין לייזר" } });

    // Added with a case, PTT not marked yet.
    await expect(
      createEquipment(undefined, form({ categoryId: laser.id, serials: "L-1", attr_case: "yes", attr_ptt: "" })),
    ).rejects.toBeInstanceOf(RedirectSignal);
    const item = await prisma.equipmentItem.findFirstOrThrow({ where: { serialNumber: "L-1" } });
    expect(item.attributes).toEqual({ case: true });

    // Missing PTT (not marked) → in the "חסר מאפיין" filter.
    expect((await getEquipmentCounts()).attrMissing).toBe(1);
    expect((await listEquipment({ attrMissing: true })).items.map((i) => i.id)).toEqual([item.id]);

    // Any user marks it; the change goes to the item's history.
    await loginAs("REGULAR");
    expect(await setItemAttributes(item.id, { ptt: true })).toMatchObject({ ok: true });
    const detail = (await getEquipmentItem(item.id))!;
    expect(detail.attributeValues).toEqual({ case: true, ptt: true });
    expect(detail.logs[0].note).toBe("שלט PTT: — ← יש");
    expect((await getEquipmentCounts()).attrMissing).toBe(0);
    expect((await listEquipment({})).items.find((i) => i.id === item.id)?.attributeTags).toEqual([
      { label: "קייס", missing: false },
      { label: "שלט PTT", missing: false },
    ]);
    // A value that isn't one of the type's options is refused.
    expect(await setItemAttributes(item.id, { ptt: "maybe" })).toMatchObject({ ok: false });
  });

  it("a choice (Romeo color); renaming a property keeps the values (stable key)", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    const romeo = [{ key: "color", label: "צבע", kind: "choice", options: ["חום", "שחור"] }];
    await createCategory("EQUIPMENT", undefined, form({ name: "רומיאו", attributes: JSON.stringify(romeo) }));
    const cat = await prisma.equipmentCategory.findFirstOrThrow({ where: { name: "רומיאו" } });
    const item = await makeItem({ categoryId: cat.id });
    expect(await setItemAttributes(item.id, { color: "חום" })).toMatchObject({ ok: true });

    await updateCategory(cat.id, undefined, form({ name: "רומיאו", attributes: JSON.stringify([{ ...romeo[0], label: "צבע גוף" }]) }));
    const detail = (await getEquipmentItem(item.id))!;
    expect(detail.attributeDefs[0].label).toBe("צבע גוף");
    expect(detail.attributeValues).toEqual({ color: "חום" });
  });

  it("drones: counts (batteries, propellers) with the yes / no accessories", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    const { DRONE_PRESET } = await import("@/lib/equipment-attributes");
    const defs = DRONE_PRESET.map((p, i) => ({ ...p, key: `d${i}` }));
    await createCategory("EQUIPMENT", undefined, form({ name: "רחפן מתקדם", attributes: JSON.stringify(defs) }));
    const cat = await prisma.equipmentCategory.findFirstOrThrow({ where: { name: "רחפן מתקדם" } });
    await expect(
      createEquipment(undefined, form({ categoryId: cat.id, serials: "D-1", attr_d0: "4", attr_d1: "8", attr_d2: "yes" })),
    ).rejects.toBeInstanceOf(RedirectSignal);
    const item = await prisma.equipmentItem.findFirstOrThrow({ where: { serialNumber: "D-1" } });
    expect(item.attributes).toEqual({ d0: 4, d1: 8, d2: true });

    await loginAs("REGULAR");
    expect(await setItemAttributes(item.id, { d0: 3 })).toMatchObject({ ok: true });
    expect((await getEquipmentItem(item.id))!.logs[0].note).toBe("סוללות: 4 ← 3");
    expect(await setItemAttributes(item.id, { d0: -2 })).toMatchObject({ ok: false });
    // Chargers / cables not marked yet → missing.
    expect((await listEquipment({ attrMissing: true })).items.map((i) => i.id)).toContain(item.id);
  });

  it("the company report adds them up per type: יש / אין / not marked, totals, per option", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    const defs = [...LASER, { key: "bat", label: "סוללות", kind: "count" }, { key: "color", label: "צבע", kind: "choice", options: ["חום", "שחור"] }];
    await createCategory("EQUIPMENT", undefined, form({ name: "מכלול", attributes: JSON.stringify(defs) }));
    const cat = await prisma.equipmentCategory.findFirstOrThrow({ where: { name: "מכלול" } });
    const a = await makeItem({ categoryId: cat.id });
    const b = await makeItem({ categoryId: cat.id });
    await makeItem({ categoryId: cat.id });
    await setItemAttributes(a.id, { case: true, bat: 4, color: "חום" });
    await setItemAttributes(b.id, { case: false, bat: 2, color: "שחור" });

    const type = (await getEquipmentReport()).find((t) => t.id === cat.id)!;
    expect(type.attributeSummary).toEqual([
      { key: "case", label: "קייס", kind: "check", yes: 1, no: 1, unset: 1 },
      { key: "ptt", label: "שלט PTT", kind: "check", yes: 0, no: 0, unset: 3 },
      { key: "bat", label: "סוללות", kind: "count", total: 6, recorded: 2, unset: 1 },
      { key: "color", label: "צבע", kind: "choice", options: [{ option: "חום", n: 1 }, { option: "שחור", n: 1 }], unset: 1 },
    ]);
  });
});
