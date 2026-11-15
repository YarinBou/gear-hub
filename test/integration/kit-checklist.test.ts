import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { scopedDb } from "@/lib/db";
import { startDeployment } from "@/lib/deployment-service";
import { assignKit, completeInspection, setAllKitItems, setKitItemQuantity } from "@/app/(app)/kits/actions";
import {
  createKitItem,
  moveKitItem,
  setKitDefaultPresent,
  setKitItemActive,
  updateKitItem,
} from "@/app/(app)/kits/items/actions";
import { getKit } from "@/lib/queries/kits";
import { RedirectSignal, viewDeploymentCookie } from "./auth-mock";
import { activeDeployment, form, homeCompany, kitItemId, kitLine, loginAs, makeKit, makeSoldier } from "./factories";

// The personal-kit checklist is the company's own list (KitItemDef), edited by admins on
// /kits/items. Changes apply to the active deployment; closed deployments keep what was recorded.

async function start(name: string, mode: "copy" | "empty", userId: string) {
  const companyId = await homeCompany();
  return scopedDb(companyId).$transaction((tx) => startDeployment(tx, { companyId, name, mode, userId }), { timeout: 30_000 });
}

describe("managing the checklist", () => {
  it("only admins can change it", async () => {
    await loginAs("REGULAR");
    await expect(createKitItem(undefined, form({ label: "x", groupName: "y" }))).rejects.toBeInstanceOf(RedirectSignal);
    await expect(setKitDefaultPresent(true)).rejects.toBeInstanceOf(RedirectSignal);
  });

  it("an item added mid-deployment appears on every kit, starting per the company setting", async () => {
    await loginAs("ADMIN");
    const d = await activeDeployment();
    const kit = await makeKit({ kitNumber: 1 });
    await setKitDefaultPresent(true);

    const res = await createKitItem(undefined, form({ label: "מחסניות", groupName: "נשק אישי", targetQuantity: 7 }));
    expect(res).toMatchObject({ ok: true });
    expect(await kitLine(kit.id, "מחסניות")).toMatchObject({ quantity: 7 });

    // A new item lands at the end of its group.
    const detail = await getKit(1);
    const weaponGroup = detail!.lines.filter((l) => l.groupName === "נשק אישי").map((l) => l.label);
    expect(weaponGroup).toEqual(["נשק אישי", "מחסניות"]);
    expect(d.status).toBe("ACTIVE");
  });

  it("counted items: readiness follows the quantity, and the inspection records the gap", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    const soldier = await makeSoldier();
    await createKitItem(undefined, form({ label: "מחסניות", groupName: "נשק אישי", targetQuantity: 7 }));
    await assignKit(2, undefined, form({ soldierId: soldier.id }));
    await setAllKitItems(2);
    expect((await getKit(2))!.lines.every((l) => (l.targetQuantity ? l.quantity === l.targetQuantity : l.present))).toBe(true);

    await setKitItemQuantity(2, await kitItemId("מחסניות"), 5);
    expect(await completeInspection(2, "")).toMatchObject({ ok: true, message: "מסדר נרשם — פריט אחד חסר" });
    const insp = await prisma.kitInspection.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(insp.missingItems).toEqual(["מחסניות (5/7)"]);
  });

  it("switching an item to counted (and back) converts the active kits", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    const kit = await makeKit({ kitNumber: 3 });
    const helmet = await kitItemId("קסדה");
    await setAllKitItems(3); // helmet present

    await updateKitItem(helmet, undefined, form({ label: "קסדה", groupName: "ציוד אישי ללוחם", targetQuantity: 2 }));
    expect(await kitLine(kit.id, "קסדה")).toMatchObject({ quantity: 2 });

    await setKitItemQuantity(3, helmet, 1);
    await updateKitItem(helmet, undefined, form({ label: "קסדה", groupName: "ציוד אישי ללוחם", targetQuantity: "" }));
    expect(await kitLine(kit.id, "קסדה")).toMatchObject({ present: false });
  });

  it("items can be reordered", async () => {
    await loginAs("ADMIN");
    const sling = await kitItemId("רצועת נשק");
    const before = await prisma.kitItemDef.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { label: true } });
    await moveKitItem(sling, "up");
    const after = await prisma.kitItemDef.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { label: true } });
    const i = before.findIndex((x) => x.label === "רצועת נשק");
    expect(after[i - 1].label).toBe("רצועת נשק");
    expect(after[i].label).toBe(before[i - 1].label);
  });
});

describe("history and deployments", () => {
  it("a deactivated item disappears from the live kit but stays in a closed deployment", async () => {
    const admin = await loginAs("ADMIN");
    const first = await activeDeployment();
    const soldier = await makeSoldier();
    await assignKit(1, undefined, form({ soldierId: soldier.id }));
    await setAllKitItems(1);
    await start("שנייה", "copy", admin.id);

    await setKitItemActive(await kitItemId("פנס ראש"), false);
    expect((await getKit(1))!.lines.map((l) => l.label)).not.toContain("פנס ראש");

    viewDeploymentCookie(first.id);
    const old = await getKit(1);
    expect(old!.lines.find((l) => l.label === "פנס ראש")).toMatchObject({ present: true });
  });

  it("'copy' carries the checklist; 'empty' follows the company's start setting", async () => {
    const admin = await loginAs("ADMIN");
    await activeDeployment();
    const soldier = await makeSoldier();
    await assignKit(4, undefined, form({ soldierId: soldier.id }));
    await setAllKitItems(4);

    const { deployment: copied } = await start("ממשיכה", "copy", admin.id);
    const k4 = await prisma.personalKit.findUniqueOrThrow({ where: { deploymentId_kitNumber: { deploymentId: copied.id, kitNumber: 4 } } });
    expect(await kitLine(k4.id, "קסדה")).toMatchObject({ present: true });

    await setKitDefaultPresent(true);
    const { deployment: empty } = await start("נקייה", "empty", admin.id);
    const k10 = await prisma.personalKit.findUniqueOrThrow({ where: { deploymentId_kitNumber: { deploymentId: empty.id, kitNumber: 10 } } });
    expect(await kitLine(k10.id, "קסדה")).toMatchObject({ present: true });

    await setKitDefaultPresent(false);
    const { deployment: empty2 } = await start("נקייה 2", "empty", admin.id);
    const k11 = await prisma.personalKit.findUniqueOrThrow({ where: { deploymentId_kitNumber: { deploymentId: empty2.id, kitNumber: 11 } } });
    expect(await kitLine(k11.id, "קסדה")).toMatchObject({ present: false });
  });

  it("each company has its own checklist", async () => {
    await loginAs("ADMIN");
    await createKitItem(undefined, form({ label: "רק אצלנו", groupName: "שונות" }));
    const other = await prisma.company.create({ data: { name: "פלוגה אחרת" } });
    expect(await prisma.kitItemDef.count({ where: { companyId: other.id, label: "רק אצלנו" } })).toBe(0);
    expect(await prisma.kitItemDef.count({ where: { companyId: await homeCompany(), label: "רק אצלנו" } })).toBe(1);
  });
});
