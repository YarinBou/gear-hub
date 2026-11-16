import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { scopedDb } from "@/lib/db";
import { startDeployment } from "@/lib/deployment-service";
import {
  assignKit,
  completeInspection,
  setAllKitItems,
  setKitBaseline,
  setKitItem,
  setKitItemQuantity,
  signKit,
} from "@/app/(app)/kits/actions";
import { createKitItem, updateKitItem } from "@/app/(app)/kits/items/actions";
import { getKit, getKitSummary } from "@/lib/queries/kits";
import { activeDeployment, form, homeCompany, kitItemId, kitLine, loginAs, makeSoldier } from "./factories";

// What a soldier signed for (KitItemStatus.baseline) is their kit: only that can be missing.

const SIGNATURE = "data:image/png;base64,AAAA";

async function kitId(kitNumber: number) {
  const d = await activeDeployment();
  return (await prisma.personalKit.findFirstOrThrow({ where: { deploymentId: d.id, kitNumber } })).id;
}

/** Issue kit n to a new soldier with exactly these plain lines present, and sign. */
async function signedKit(n: number, present: string[]) {
  await activeDeployment();
  const soldier = await makeSoldier();
  expect(await assignKit(n, undefined, form({ soldierId: soldier.id }))).toMatchObject({ ok: true });
  for (const label of present) await setKitItem(n, await kitItemId(label), true);
  expect(await signKit(n, SIGNATURE)).toMatchObject({ ok: true });
  return { soldier, id: await kitId(n) };
}

describe("what the soldier signed for", () => {
  it("signing records the kit as it is; lines not signed for are never missing", async () => {
    await loginAs("ADMIN");
    const { id } = await signedKit(5, ["קסדה", "שק שינה"]);
    expect(await kitLine(id, "קסדה")).toMatchObject({ baseline: 1 });
    expect(await kitLine(id, "וסט קרבי")).toMatchObject({ baseline: 0 });

    let kit = (await getKit(5))!;
    expect(kit.lines.filter((l) => l.baseline !== 0).map((l) => l.label).sort()).toEqual(["קסדה", "שק שינה"].sort());

    // The sleeping bag goes missing: the inspection lists only that, not the vest he never had.
    await setKitItem(5, await kitItemId("שק שינה"), false);
    expect(await completeInspection(5, "")).toMatchObject({ ok: true, message: "מסדר נרשם — פריט אחד חסר" });
    const insp = await prisma.kitInspection.findFirstOrThrow({ where: { kitId: id }, orderBy: { createdAt: "desc" } });
    expect(insp.missingItems).toEqual(["שק שינה"]);

    // "הכל קיים" fills only what he signed for.
    await setAllKitItems(5);
    kit = (await getKit(5))!;
    expect(kit.lines.find((l) => l.label === "שק שינה")).toMatchObject({ present: true });
    expect(kit.lines.find((l) => l.label === "וסט קרבי")).toMatchObject({ present: false });
  });

  it("counted lines: each soldier is checked against the quantity they signed for", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    await createKitItem(undefined, form({ label: "חולצת ב'", groupName: "ביגוד", targetQuantity: 2 }));
    const shirts = await kitItemId("חולצת ב'");
    const soldier = await makeSoldier();
    await assignKit(6, undefined, form({ soldierId: soldier.id }));
    await setKitItemQuantity(6, shirts, 1);
    await signKit(6, SIGNATURE);
    const id = await kitId(6);
    expect(await kitLine(id, "חולצת ב'")).toMatchObject({ baseline: 1, quantity: 1 });
    expect((await getKit(6))!.lines.find((l) => l.itemId === shirts)).toBeTruthy();

    await setKitItemQuantity(6, shirts, 0);
    await completeInspection(6, "");
    const insp = await prisma.kitInspection.findFirstOrThrow({ where: { kitId: id }, orderBy: { createdAt: "desc" } });
    expect(insp.missingItems).toContain("חולצת ב' (0/1)");

    await setAllKitItems(6);
    expect(await kitLine(id, "חולצת ב'")).toMatchObject({ quantity: 1 });
  });

  it("can be corrected after signing; plain lines are 0 or 1", async () => {
    await loginAs("ADMIN");
    const { id } = await signedKit(8, ["קסדה"]);
    const vest = await kitItemId("וסט קרבי");
    expect(await setKitBaseline(8, vest, 3)).toMatchObject({ ok: true });
    expect(await kitLine(id, "וסט קרבי")).toMatchObject({ baseline: 1 });
    await completeInspection(8, "");
    const insp = await prisma.kitInspection.findFirstOrThrow({ where: { kitId: id }, orderBy: { createdAt: "desc" } });
    expect(insp.missingItems).toContain("וסט קרבי");
  });

  it("a new holder starts without the previous holder's baseline", async () => {
    await loginAs("ADMIN");
    const { id } = await signedKit(9, ["קסדה"]);
    const next = await makeSoldier({ name: "חדש" });
    await assignKit(9, undefined, form({ soldierId: next.id }));
    expect(await prisma.kitItemStatus.count({ where: { kitId: id, baseline: { not: null } } })).toBe(0);
  });

  it("switching a line to counted converts what was signed for", async () => {
    await loginAs("ADMIN");
    const { id } = await signedKit(10, ["פלטות קרמיות"]);
    const plates = await kitItemId("פלטות קרמיות");
    expect(await updateKitItem(plates, undefined, form({ label: "פלטות קרמיות", groupName: "ציוד אישי ללוחם", targetQuantity: 2 }))).toMatchObject({
      ok: true,
    });
    expect(await kitLine(id, "פלטות קרמיות")).toMatchObject({ quantity: 2, baseline: 2 });
  });

  it("carries over to the next deployment with the kit", async () => {
    const admin = await loginAs("ADMIN");
    await signedKit(11, ["קסדה"]);
    const companyId = await homeCompany();
    const next = await scopedDb(companyId).$transaction(
      (tx) => startDeployment(tx, { companyId, name: "הבא", mode: "copy", userId: admin.id }),
      { timeout: 30_000 },
    );
    const kit = await prisma.personalKit.findFirstOrThrow({ where: { deploymentId: next.deployment.id, kitNumber: 11 } });
    expect(await kitLine(kit.id, "קסדה")).toMatchObject({ baseline: 1 });
    expect(await kitLine(kit.id, "וסט קרבי")).toMatchObject({ baseline: 0 });
  });
});

describe("kit summary", () => {
  it("sums signed for / there / missing over issued kits, per platoon", async () => {
    await loginAs("ADMIN");
    const a = await signedKit(1, ["קסדה"]);
    await signedKit(2, ["קסדה", "וסט קרבי"]);
    await setKitItem(1, await kitItemId("קסדה"), false);

    const all = await getKitSummary();
    expect(all).toMatchObject({ kits: 2, signedKits: 2 });
    expect(all.lines.find((l) => l.label === "קסדה")).toMatchObject({ signed: 2, have: 1, missing: 1 });
    expect(all.lines.find((l) => l.label === "וסט קרבי")).toMatchObject({ signed: 1, have: 1, missing: 0 });

    const mine = await getKitSummary(a.soldier.platoonId);
    expect(mine.kits).toBeGreaterThanOrEqual(1);
  });
});
