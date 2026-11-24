import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { scopedDb } from "@/lib/db";
import { startDeployment } from "@/lib/deployment-service";
import {
  assignKit,
  completeContentsCheck,
  returnKit,
  setAllKitItems,
  setKitItem,
  signKit,
} from "@/app/(app)/kits/actions";
import { setKitDefaultPresent } from "@/app/(app)/kits/items/actions";
import { listKits } from "@/lib/queries/kits";
import { activeDeployment, form, homeCompany, kitItemId, kitLine, loginAs, makeSoldier } from "./factories";

// בדיקת תכולה: is what's in a kit in stock known? A full contents check, or the return of a kit the
// soldier signed for in full, makes it "checked"; a partly-signed return leaves it "partial".

const SIGNATURE = "data:image/png;base64,AAAA";

async function kitRow(n: number, deploymentId?: string) {
  const d = deploymentId ?? (await activeDeployment()).id;
  return prisma.personalKit.findUniqueOrThrow({ where: { deploymentId_kitNumber: { deploymentId: d, kitNumber: n } } });
}

const tile = async (n: number) => (await listKits()).find((k) => k.kitNumber === n)!;

describe("contents check (בדיקת תכולה)", () => {
  it("a kit nobody opened is 'unchecked'; a full check marks it checked and is recorded", async () => {
    await loginAs("REGULAR");
    await activeDeployment();
    await setKitItem(3, await kitItemId("קסדה"), true);
    expect((await tile(3)).stock).toMatchObject({ state: "unchecked" });

    expect(await completeContentsCheck(3, "נבדק במחסן")).toMatchObject({ ok: true });
    expect((await tile(3)).stock).toMatchObject({ state: "checked" });
    const k = await kitRow(3);
    expect(k.contentsCheckedAt).not.toBeNull();
    const ins = await prisma.kitInspection.findFirstOrThrow({ where: { kitId: k.id } });
    expect(ins).toMatchObject({ fullCheck: true, note: "נבדק במחסן" });
    expect(ins.missingItems).not.toContain("קסדה");
    expect(ins.missingItems).not.toContain("נשק אישי");
  });

  it("is for kits in stock — an issued kit gets a מסדר", async () => {
    await loginAs("REGULAR");
    await activeDeployment();
    const s = await makeSoldier();
    expect(await assignKit(4, undefined, form({ soldierId: s.id }))).toMatchObject({ ok: true });
    expect(await completeContentsCheck(4, "")).toMatchObject({ ok: false });
  });

  it("returning a kit signed in full checks it; a partly-signed one stays 'partial'", async () => {
    await loginAs("REGULAR");
    await activeDeployment();
    const [full, partial] = [await makeSoldier(), await makeSoldier({ name: "חלקי" })];

    await assignKit(5, undefined, form({ soldierId: full.id }));
    expect(await setAllKitItems(5)).toMatchObject({ ok: true });
    expect(await signKit(5, SIGNATURE)).toMatchObject({ ok: true });
    expect((await tile(5)).coverage).toMatchObject({ signed: expect.any(Number) });
    expect((await tile(5)).coverage!.signed).toBe((await tile(5)).coverage!.total);
    const r1 = await returnKit(5, { soldierId: full.id, returned: {}, gapNotes: {} });
    expect(r1).toMatchObject({ ok: true, fullCheck: true });
    expect((await tile(5)).stock).toMatchObject({ state: "checked" });

    // Signed only for a strap.
    await assignKit(6, undefined, form({ soldierId: partial.id }));
    await setKitItem(6, await kitItemId("רצועת נשק"), true);
    await signKit(6, SIGNATURE);
    const signed = await tile(6);
    expect(signed.coverage!.signed).toBeLessThan(signed.coverage!.total);
    const r2 = await returnKit(6, { soldierId: partial.id, returned: {}, gapNotes: {} });
    expect(r2).toMatchObject({ ok: true, fullCheck: false });
    expect(r2.message).toContain("בדיקת תכולה");
    expect((await tile(6)).stock).toMatchObject({ state: "partial" });
  });

  it("a checked kit keeps its contents in the next deployment, and start settings don't overwrite it", async () => {
    const admin = await loginAs("ADMIN");
    const first = await activeDeployment();
    await setKitItem(7, await kitItemId("קסדה"), true);
    await completeContentsCheck(7, "");
    await setKitItem(8, await kitItemId("קסדה"), true); // touched but never checked

    const companyId = await homeCompany();
    const { deployment } = await scopedDb(companyId).$transaction(
      (tx) => startDeployment(tx, { companyId, name: "הבאה", mode: "empty", userId: admin.id }),
      { timeout: 30_000 },
    );
    const k7 = await kitRow(7, deployment.id);
    expect(k7.contentsCheckedAt).not.toBeNull();
    expect(await kitLine(k7.id, "קסדה")).toMatchObject({ present: true, baseline: null });
    // The unchecked kit starts per the start settings (missing, for this company).
    expect(await kitLine((await kitRow(8, deployment.id)).id, "קסדה")).toMatchObject({ present: false });

    // "הכל חסר / הכל קיים" applies to never-opened kits only.
    await setKitDefaultPresent(true);
    await setKitDefaultPresent(false);
    expect(await kitLine(k7.id, "קסדה")).toMatchObject({ present: true });
    expect(first.id).not.toBe(deployment.id);
  });

  it("a partly-signed kit returned with the rest of the bag checked is 'checked', with what was found", async () => {
    await loginAs("REGULAR");
    await activeDeployment();
    const soldier = await makeSoldier();
    const [strap, helmet, bag] = [await kitItemId("רצועת נשק"), await kitItemId("קסדה"), await kitItemId("שק שינה")];
    await assignKit(9, undefined, form({ soldierId: soldier.id }));
    await setKitItem(9, strap, true);
    await signKit(9, SIGNATURE);

    // Signed only for the strap (and the magazines / rounds that start full); the rest checked on return.
    const r = await returnKit(9, { soldierId: soldier.id, returned: { [strap]: 1 }, gapNotes: {}, found: { [helmet]: 1, [bag]: 0 } });
    expect(r).toMatchObject({ ok: true, fullCheck: true });
    expect((await tile(9)).stock).toMatchObject({ state: "checked" });
    const k = await kitRow(9);
    expect(await kitLine(k.id, "קסדה")).toMatchObject({ present: true, baseline: null });
    expect(await kitLine(k.id, "שק שינה")).toMatchObject({ present: false });
    expect(await kitLine(k.id, "רצועת נשק")).toMatchObject({ present: true });
  });
});
