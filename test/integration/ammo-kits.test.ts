import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordMovement } from "@/app/(app)/ammo/actions";
import { assignKit, completeInspection, setKitItem, signKit, updateWeapon } from "@/app/(app)/kits/actions";
import { activeDeployment, form, loginAs, makeAmmoStock, makeItem, makeSoldier, stateOf } from "./factories";

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

    const w = await updateWeapon(7, undefined, form({ personalWeaponId: rifle.id, magazineCount: 7, ammoCount: 210 }));
    expect(w).toMatchObject({ ok: true });
    // Linking a rifle from the armory hands it to the soldier through the equipment service.
    expect(await stateOf(rifle.id)).toMatchObject({
      assignedSoldierId: a.id,
      status: "WITH_SOLDIER",
    });

    expect(await signKit(7, SIGNATURE)).toMatchObject({ ok: true });
    let kit = await prisma.personalKit.findFirstOrThrow({ where: { kitNumber: 7 } });
    expect(kit).toMatchObject({ soldierId: a.id, personalWeaponId: rifle.id, weaponIssued: true });
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
    await setKitItem(4, "helmet", true);
    expect(await completeInspection(4, "")).toMatchObject({ ok: true });
    const insp = await prisma.kitInspection.findFirstOrThrow();
    expect(insp.missingItems).not.toContain("helmet");
    expect(insp.missingItems).toContain("sleepingBag");
  });
});
