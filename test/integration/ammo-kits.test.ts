import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addStock, recordMovement, verifyStocks } from "@/app/(app)/ammo/actions";
import { assignKit, completeInspection, setKitItem, signKit, updateWeapon } from "@/app/(app)/kits/actions";
import { activeDeployment, form, kitItemId, kitLine, loginAs, makeAmmoStock, makeCategory, makeItem, makeSoldier, stateOf } from "./factories";

const SIGNATURE = "data:image/png;base64,AAAA";

describe("ammo movements", () => {
  it("receive / issue update the stock and write a log entry", async () => {
    await loginAs("REGULAR");
    const stock = await makeAmmoStock({ quantity: 100 });

    expect(await recordMovement(stock.id, undefined, form({ type: "RECEIVE", amount: 50 }))).toMatchObject({ ok: true });
    expect(await recordMovement(stock.id, undefined, form({ type: "ISSUE", amount: 30 }))).toMatchObject({ ok: true });

    expect((await prisma.ammoStock.findUniqueOrThrow({ where: { id: stock.id } })).quantity).toBe(120);
    const logs = await prisma.ammoLog.findMany({ where: { stockId: stock.id }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => [l.type, l.previousQuantity, l.newQuantity])).toEqual([
      ["RECEIVE", 100, 150],
      ["ISSUE", 150, 120],
    ]);
  });

  it("an issue larger than the stock is refused and changes nothing", async () => {
    await loginAs();
    const stock = await makeAmmoStock({ quantity: 10 });
    expect(await recordMovement(stock.id, undefined, form({ type: "ISSUE", amount: 11 }))).toHaveProperty("error");
    expect((await prisma.ammoStock.findUniqueOrThrow({ where: { id: stock.id } })).quantity).toBe(10);
    expect(await prisma.ammoLog.count()).toBe(0);
  });
});

describe("ammo verification (אימות)", () => {
  it("confirms the quantity as a count with no change, for one row or a whole location", async () => {
    await loginAs("REGULAR");
    const a = await makeAmmoStock({ location: "חפ\"ק", quantity: 120 });
    const b = await makeAmmoStock({ location: "חפ\"ק", quantity: 7 });

    expect(await verifyStocks([{ id: a.id, quantity: 120 }])).toMatchObject({ ok: true, message: "הכמות אומתה" });
    expect(await verifyStocks([{ id: a.id, quantity: 120 }, { id: b.id, quantity: 7 }])).toMatchObject({ ok: true, message: "2 שורות אומתו" });

    const logs = await prisma.ammoLog.findMany({ where: { stockId: a.id } });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ type: "COUNT", amount: 120, previousQuantity: 120, newQuantity: 120, note: "אימות — ללא שינוי" });
    const after = await prisma.ammoStock.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.quantity).toBe(7);
    expect(after.lastCountedAt).not.toBeNull();
  });

  it("skips a row whose quantity changed since the page was loaded", async () => {
    await loginAs();
    const a = await makeAmmoStock({ quantity: 50 });
    const b = await makeAmmoStock({ quantity: 10 });
    const r = await verifyStocks([{ id: a.id, quantity: 40 }, { id: b.id, quantity: 10 }]);
    expect(r).toMatchObject({ ok: true });
    expect(r.message).toContain("1 דולגו");
    expect(await prisma.ammoLog.count({ where: { stockId: a.id } })).toBe(0);
    expect(await verifyStocks([{ id: a.id, quantity: 40 }])).toMatchObject({ ok: false });
  });
});

describe("ammo held by a soldier", () => {
  it("opens a stock under the soldier's name, linked to the soldier", async () => {
    await loginAs();
    await activeDeployment();
    const cat = await makeCategory({ domain: "AMMUNITION" });
    const soldier = await makeSoldier({ name: "דני כהן" });

    const r = await addStock(undefined, form({ holder: "soldier", soldierId: soldier.id, categoryId: cat.id, quantity: 90 }));
    expect(r).toMatchObject({ ok: true });
    expect(await prisma.ammoStock.findFirstOrThrow({ where: { categoryId: cat.id } })).toMatchObject({
      soldierId: soldier.id,
      location: "דני כהן",
      quantity: 90,
    });
  });

  it("adds the personal number when two soldiers share a name", async () => {
    await loginAs();
    await activeDeployment();
    const cat = await makeCategory({ domain: "AMMUNITION" });
    await makeSoldier({ name: "יוסי לוי", personalNumber: "1111111" });
    const b = await makeSoldier({ name: "יוסי לוי", personalNumber: "2222222" });

    expect(await addStock(undefined, form({ holder: "soldier", soldierId: b.id, categoryId: cat.id, quantity: 10 }))).toMatchObject({ ok: true });
    expect((await prisma.ammoStock.findFirstOrThrow({ where: { soldierId: b.id } })).location).toBe("יוסי לוי (2222222)");
  });

  it("refuses an inactive soldier", async () => {
    await loginAs();
    await activeDeployment();
    const cat = await makeCategory({ domain: "AMMUNITION" });
    const gone = await makeSoldier({ isActive: false });
    const r = await addStock(undefined, form({ holder: "soldier", soldierId: gone.id, categoryId: cat.id, quantity: 10 }));
    expect(r?.errors).toHaveProperty("soldierId");
    expect(await prisma.ammoStock.count()).toBe(0);
  });
});

describe("personal kits", () => {
  // Kits belong to a deployment.
  beforeEach(async () => {
    await activeDeployment();
  });

  it("assign → link weapon → sign → reassign clears signature and weapon", async () => {
    await loginAs();
    const a = await makeSoldier();
    const b = await makeSoldier();
    const rifle = await makeItem();

    expect(await assignKit(7, undefined, form({ soldierId: a.id }))).toMatchObject({ ok: true });

    const w = await updateWeapon(7, undefined, form({ personalWeaponId: rifle.id }));
    expect(w).toMatchObject({ ok: true });
    // Linking a rifle from the armory hands it to the soldier through the equipment service.
    expect(await stateOf(rifle.id)).toMatchObject({
      assignedSoldierId: a.id,
      status: "WITH_SOLDIER",
    });

    expect(await signKit(7, SIGNATURE)).toMatchObject({ ok: true });
    let kit = await prisma.personalKit.findFirstOrThrow({ where: { kitNumber: 7 } });
    expect(kit).toMatchObject({ soldierId: a.id, personalWeaponId: rifle.id });
    // Linking the rifle fulfils the checklist's personal-weapon line.
    expect(await kitLine(kit.id, "נשק אישי")).toMatchObject({ present: true });
    expect(kit.signedAt).not.toBeNull();

    await assignKit(7, undefined, form({ soldierId: b.id }));
    kit = await prisma.personalKit.findFirstOrThrow({ where: { kitNumber: 7 } });
    expect(kit).toMatchObject({ soldierId: b.id, personalWeaponId: null, signedAt: null, signatureData: null });
  });

  it("a soldier can hold only one kit", async () => {
    await loginAs();
    const s = await makeSoldier();
    await assignKit(1, undefined, form({ soldierId: s.id }));
    expect(await assignKit(2, undefined, form({ soldierId: s.id }))).toHaveProperty("error");
  });

  it("can't sign or inspect a kit that isn't issued", async () => {
    await loginAs();
    expect(await signKit(3, SIGNATURE)).toMatchObject({ ok: false });
    expect(await completeInspection(3, "")).toMatchObject({ ok: false });
  });

  it("an inspection snapshots the missing items", async () => {
    await loginAs();
    const s = await makeSoldier();
    await assignKit(4, undefined, form({ soldierId: s.id }));
    await setKitItem(4, await kitItemId("קסדה"), true);
    expect(await completeInspection(4, "")).toMatchObject({ ok: true });
    const insp = await prisma.kitInspection.findFirstOrThrow();
    // Recorded by name, as items are called at the time.
    expect(insp.missingItems).not.toContain("קסדה");
    expect(insp.missingItems).toContain("שק שינה");
  });
});
