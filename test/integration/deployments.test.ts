import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { scopedDb } from "@/lib/db";
import { startDeployment } from "@/lib/deployment-service";
import { recordMovement } from "@/app/(app)/ammo/actions";
import { closeDeploymentAction, startDeploymentAction, viewDeployment } from "@/app/(app)/deployments/actions";
import { assignEquipment, bulkSetStatus, createEquipment, verifyEquipment } from "@/app/(app)/equipment/actions";
import { assignKit, setKitItem, signKit } from "@/app/(app)/kits/actions";
import { setSoldierActive } from "@/app/(app)/roster/actions";
import { getEquipmentCounts, getEquipmentItem, listEquipment } from "@/lib/queries/equipment";
import { getAmmoOverview } from "@/lib/queries/ammo";
import { listKits } from "@/lib/queries/kits";
import { RedirectSignal, viewDeploymentCookie } from "./auth-mock";
import {
  activeDeployment,
  form,
  homeCompany,
  loginAs,
  makeAmmoStock,
  makeCategory,
  makeCompany,
  makeDeployment,
  makeItem,
  makeSoldier,
  stateOf,
} from "./factories";

// Deployments (הפעלות): who holds what, the kits and the ammo belong to one deployment.
// Closed deployments are a read-only history; a company may have no active deployment at all.

const SIGNATURE = "data:image/png;base64,AAAA";

/** Start a new deployment through the service, as the start-deployment action does. */
async function start(name: string, mode: "copy" | "empty", userId: string) {
  const companyId = await homeCompany();
  return scopedDb(companyId).$transaction((tx) => startDeployment(tx, { companyId, name, mode, userId }), {
    timeout: 30_000,
  });
}

async function kit(deploymentId: string, kitNumber: number) {
  return prisma.personalKit.findUniqueOrThrow({ where: { deploymentId_kitNumber: { deploymentId, kitNumber } } });
}

describe("starting a deployment", () => {
  it("'copy' carries holders, kits (without signatures) and ammo into the new deployment", async () => {
    const admin = await loginAs("ADMIN");
    const first = await activeDeployment();
    const soldier = await makeSoldier({ platoon: "PLATOON_3" });
    const rifle = await makeItem();
    const stock = await makeAmmoStock({ quantity: 500, location: "בונקר" });
    await assignEquipment(rifle.id, undefined, form({ soldierId: soldier.id }));
    await assignKit(5, undefined, form({ soldierId: soldier.id }));
    await setKitItem(5, "helmet", true);
    await signKit(5, SIGNATURE);

    const { deployment: second, closed } = await start("שכם 2026", "copy", admin.id);
    expect(closed?.id).toBe(first.id);

    // The rifle is still with the soldier, in the new deployment.
    expect(await stateOf(rifle.id, second.id)).toMatchObject({ assignedSoldierId: soldier.id, status: "WITH_SOLDIER", platoon: "PLATOON_3" });
    // Kit 5: same holder and checklist, but the soldier must sign again.
    expect(await kit(second.id, 5)).toMatchObject({ soldierId: soldier.id, helmet: true, signedAt: null, signatureData: null });
    // Ammo: opening balance with a log entry.
    const stocks = await prisma.ammoStock.findMany({ where: { deploymentId: second.id }, include: { logs: true } });
    expect(stocks).toHaveLength(1);
    expect(stocks[0]).toMatchObject({ categoryId: stock.categoryId, location: "בונקר", quantity: 500 });
    expect(stocks[0].logs[0]).toMatchObject({ type: "COUNT", previousQuantity: 0, newQuantity: 500 });
    expect(await kit(second.id, 98)).toMatchObject({ soldierId: null });
  });

  it("'empty' starts clean but keeps missing / in-repair items as they are", async () => {
    const admin = await loginAs("ADMIN");
    const first = await activeDeployment();
    const soldier = await makeSoldier();
    const held = await makeItem({ assignedSoldierId: soldier.id, status: "WITH_SOLDIER", platoon: "PLATOON_1" });
    const lost = await makeItem({ status: "MISSING" });
    const broken = await makeItem({ status: "IN_REPAIR" });
    await makeAmmoStock({ quantity: 100 });

    const { deployment: second } = await start("גוש עציון", "empty", admin.id);

    expect(await stateOf(held.id, second.id)).toMatchObject({ assignedSoldierId: null, status: "IN_ARMORY", platoon: null });
    expect((await stateOf(lost.id, second.id)).status).toBe("MISSING");
    expect((await stateOf(broken.id, second.id)).status).toBe("IN_REPAIR");
    expect(await prisma.ammoStock.count({ where: { deploymentId: second.id } })).toBe(0);
    expect(await prisma.personalKit.count({ where: { deploymentId: second.id } })).toBe(98);

    // The first deployment is untouched history.
    expect(await stateOf(held.id, first.id)).toMatchObject({ assignedSoldierId: soldier.id, status: "WITH_SOLDIER" });
    expect((await prisma.deployment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("CLOSED");
  });

  it("'copy' drops soldiers who have left the roster", async () => {
    const admin = await loginAs("ADMIN");
    await activeDeployment();
    const leaver = await makeSoldier();
    const rifle = await makeItem({ assignedSoldierId: leaver.id, status: "WITH_SOLDIER", platoon: "PLATOON_1" });
    await assignKit(9, undefined, form({ soldierId: leaver.id }));
    await prisma.soldier.update({ where: { id: leaver.id }, data: { isActive: false } });

    const { deployment: second } = await start("הפעלה ב", "copy", admin.id);
    expect(await stateOf(rifle.id, second.id)).toMatchObject({ assignedSoldierId: null, status: "IN_ARMORY" });
    expect(await kit(second.id, 9)).toMatchObject({ soldierId: null });
  });

  it("only an admin can start or end a deployment", async () => {
    await loginAs("REGULAR");
    await expect(startDeploymentAction(undefined, form({ name: "x", mode: "empty" }))).rejects.toBeInstanceOf(RedirectSignal);
    const d = await activeDeployment();
    await expect(closeDeploymentAction(d.id)).rejects.toBeInstanceOf(RedirectSignal);
  });

  it("names are unique per company, and the action reports it", async () => {
    await loginAs("ADMIN");
    await makeDeployment({ name: "עזה 2023", status: "CLOSED" });
    expect(await startDeploymentAction(undefined, form({ name: "עזה 2023", mode: "empty" }))).toHaveProperty("errors.name");
  });
});

describe("one active deployment per company", () => {
  it("the database refuses a second active deployment", async () => {
    await activeDeployment();
    await expect(makeDeployment({ status: "ACTIVE" })).rejects.toThrow();
  });

  it("each company can have its own active deployment", async () => {
    const other = await makeCompany();
    await activeDeployment();
    await expect(activeDeployment(other.id)).resolves.toMatchObject({ status: "ACTIVE", companyId: other.id });
  });
});

describe("a closed deployment is read-only", () => {
  it("viewing it shows its own state, and every write is refused", async () => {
    const admin = await loginAs("ADMIN");
    const first = await activeDeployment();
    const soldier = await makeSoldier();
    const rifle = await makeItem();
    const stock = await makeAmmoStock({ quantity: 50 });
    await assignEquipment(rifle.id, undefined, form({ soldierId: soldier.id }));
    const { deployment: second } = await start("חדשה", "empty", admin.id);

    // Look back at the first deployment.
    viewDeploymentCookie(first.id);
    const page = await listEquipment({});
    expect(page.items[0]).toMatchObject({ id: rifle.id, status: "WITH_SOLDIER", assignedSoldier: { id: soldier.id } });

    expect(await assignEquipment(rifle.id, undefined, form({ soldierId: "" }))).toHaveProperty("error");
    expect(await verifyEquipment([rifle.id])).toMatchObject({ ok: false });
    expect(await bulkSetStatus([rifle.id], "MISSING")).toMatchObject({ ok: false });
    expect(await setKitItem(1, "helmet", true)).toMatchObject({ ok: false });
    expect(await assignKit(1, undefined, form({ soldierId: soldier.id }))).toHaveProperty("error");
    expect(await recordMovement(stock.id, undefined, form({ type: "ISSUE", amount: 1 }))).toHaveProperty("error");

    expect(await stateOf(rifle.id, first.id)).toMatchObject({ assignedSoldierId: soldier.id, status: "WITH_SOLDIER" });
    expect((await prisma.ammoStock.findUniqueOrThrow({ where: { id: stock.id } })).quantity).toBe(50);

    // Back to the active one: the rifle is in the armory there.
    viewDeploymentCookie(null);
    expect((await listEquipment({})).items[0]).toMatchObject({ id: rifle.id, status: "IN_ARMORY" });
    expect(await stateOf(rifle.id, second.id)).toMatchObject({ status: "IN_ARMORY" });
  });

  it("an item's history spans deployments, labelled with each one", async () => {
    const admin = await loginAs("ADMIN");
    await activeDeployment();
    const soldier = await makeSoldier();
    const rifle = await makeItem();
    await assignEquipment(rifle.id, undefined, form({ soldierId: soldier.id }));
    const { deployment: second } = await start("שנייה", "copy", admin.id);
    await assignEquipment(rifle.id, undefined, form({ soldierId: "" }));

    const detail = await getEquipmentItem(rifle.id);
    expect(detail?.logs.map((l) => l.deployment?.name)).toEqual([second.name, expect.any(String)]);
  });

  it("a deployment cookie from another company is ignored", async () => {
    await loginAs("ADMIN");
    const mine = await activeDeployment();
    const other = await makeCompany();
    const theirs = await activeDeployment(other.id);
    await viewDeployment(theirs.id); // the action refuses to switch
    viewDeploymentCookie(theirs.id); // and a forged cookie falls back to the user's own active one
    await makeItem();
    const { items } = await listEquipment({});
    expect(items).toHaveLength(1);
    const itemCompany = await prisma.equipmentItem.findUniqueOrThrow({ where: { id: items[0].id } });
    expect(itemCompany.companyId).toBe(mine.companyId);
  });
});

describe("no active deployment", () => {
  it("everything reads as in the armory, kits and ammo are empty, and deployment writes are refused", async () => {
    await loginAs("ADMIN");
    const d = await activeDeployment();
    const soldier = await makeSoldier();
    const rifle = await makeItem();
    await makeAmmoStock({ quantity: 10 });
    await closeDeploymentAction(d.id);
    viewDeploymentCookie(null);

    expect((await getEquipmentCounts()).status.IN_ARMORY).toBe(1);
    expect((await listEquipment({})).items[0]).toMatchObject({ status: "IN_ARMORY", assignedSoldier: null });
    expect((await listEquipment({ status: "WITH_SOLDIER" })).total).toBe(0);
    expect((await listKits()).filter((k) => k.soldier)).toEqual([]);
    expect(await getAmmoOverview()).toSatisfy((types: { ammoStocks: unknown[] }[]) => types.every((t) => !t.ammoStocks.length));

    expect(await assignEquipment(rifle.id, undefined, form({ soldierId: soldier.id }))).toHaveProperty("error");
    expect(await assignKit(1, undefined, form({ soldierId: soldier.id }))).toHaveProperty("error");
  });

  it("items can still be added to the armory, but not handed out", async () => {
    await loginAs("ADMIN");
    const soldier = await makeSoldier();
    const cat = await makeCategory();

    const withHolder = await createEquipment(undefined, form({ categoryId: cat.id, serials: "A1", soldierId: soldier.id }));
    expect(withHolder).toHaveProperty("error");

    await expect(createEquipment(undefined, form({ categoryId: cat.id, serials: "A1" }))).rejects.toBeInstanceOf(RedirectSignal);
    const item = await prisma.equipmentItem.findFirstOrThrow({ where: { serialNumber: "A1" } });
    expect(await prisma.equipmentAssignment.count({ where: { itemId: item.id } })).toBe(0);

    // Starting a deployment gives every existing item a state row.
    const admin = await loginAs("ADMIN");
    const { deployment } = await start("ראשונה", "copy", admin.id);
    expect(await stateOf(item.id, deployment.id)).toMatchObject({ status: "IN_ARMORY" });
  });

  it("a soldier can leave the roster once they hold nothing in the active deployment", async () => {
    const admin = await loginAs("ADMIN");
    await activeDeployment();
    const soldier = await makeSoldier();
    const rifle = await makeItem();
    await assignEquipment(rifle.id, undefined, form({ soldierId: soldier.id }));
    expect(await setSoldierActive(soldier.id, false, undefined, form({}))).toHaveProperty("error");

    // A new, empty deployment: what they held before is history and doesn't block them.
    await start("נקייה", "empty", admin.id);
    expect(await setSoldierActive(soldier.id, false, undefined, form({}))).toBeUndefined();
  });
});
