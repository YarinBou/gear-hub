import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { scopedDb } from "@/lib/db";
import { startDeployment } from "@/lib/deployment-service";
import { assignKit, returnKit, setAllKitItems, setKitItem, setKitItemQuantity, setKitPakal, signKit } from "@/app/(app)/kits/actions";
import { createKitItem, createPakal, setKitItemOptional, setPakalItem } from "@/app/(app)/kits/items/actions";
import { getKit, listKits } from "@/lib/queries/kits";
import { RedirectSignal } from "./auth-mock";
import { activeDeployment, form, homeCompany, kitItemId, kitLine, loginAs, makeSoldier } from "./factories";

// Magazines / rounds / drums are checklist lines; optional items count only when signed for or
// required by the kit's פק"ל (role kit: נגביסט / מא"ג / חובש), which only admins set.

const SIGNATURE = "data:image/png;base64,AAAA";

async function setup() {
  await loginAs("ADMIN");
  await activeDeployment();
  // "תופי נגב" is one of the default checklist items (optional, × 4).
  expect(await createKitItem(undefined, form({ label: "וסט נגב", groupName: "ציוד אישי ללוחם", optional: "on" }))).toMatchObject({ ok: true });
  expect(await createPakal(undefined, form({ name: "נגביסט" }))).toMatchObject({ ok: true });
  const pakal = await prisma.pakal.findFirstOrThrow({ where: { name: "נגביסט" } });
  const [drums, vest] = [await kitItemId("תופי נגב"), await kitItemId("וסט נגב")];
  expect(await setPakalItem(pakal.id, drums, 4)).toMatchObject({ ok: true });
  expect(await setPakalItem(pakal.id, vest, 5)).toMatchObject({ ok: true }); // present / missing item → required (1)
  return { pakal, drums, vest };
}

const line = (lines: { label: string }[], label: string) => lines.find((l) => l.label === label);

describe('magazines, optional items and תיק פק"ל', () => {
  it("magazines and rounds are checklist lines that start full", async () => {
    await loginAs("REGULAR");
    const d = await activeDeployment();
    const soldier = await makeSoldier();
    await assignKit(2, undefined, form({ soldierId: soldier.id }));
    const kit = await prisma.personalKit.findFirstOrThrow({ where: { deploymentId: d.id, kitNumber: 2 } });
    expect(await kitLine(kit.id, "מחסניות")).toMatchObject({ quantity: 7 });
    expect(await kitLine(kit.id, "כדורים")).toMatchObject({ quantity: 210 });
  });

  it("an optional item is never missing in a regular kit, and required in a פק\"ל kit", async () => {
    const { pakal, drums } = await setup();
    const [a, b] = [await makeSoldier(), await makeSoldier({ name: "נגביסט" })];
    await assignKit(1, undefined, form({ soldierId: a.id }));
    await assignKit(2, undefined, form({ soldierId: b.id }));
    expect(await setKitPakal(2, pakal.id)).toMatchObject({ ok: true });

    const regular = (await getKit(1))!;
    expect(line(regular.lines, "תופי נגב")).toMatchObject({ pakalQuantity: null });
    expect(regular.lines.filter((l) => l.label === "תופי נגב" || l.label === "וסט נגב").every((l) => !l.pakalQuantity)).toBe(true);
    // "הכל קיים" fills the regular kit without drums, and it is complete.
    await setAllKitItems(1);
    expect((await getKit(1))!.lines.find((l) => l.label === "תופי נגב")).toMatchObject({ quantity: 0 });

    // The פק"ל kit expects 4 drums and the vest.
    await setAllKitItems(2);
    const negev = (await getKit(2))!;
    expect(line(negev.lines, "תופי נגב")).toMatchObject({ quantity: 4, pakalQuantity: 4 });
    expect(line(negev.lines, "וסט נגב")).toMatchObject({ present: true, pakalQuantity: 1 });

    // Signed with fewer drums: still short against the פק"ל.
    await setKitItemQuantity(2, drums, 2);
    await signKit(2, SIGNATURE);
    const signed = (await getKit(2))!;
    const { lineComplete } = await import("@/lib/kit");
    expect(lineComplete(line(signed.lines, "תופי נגב") as never)).toBe(false);

    // The tile shows the mark.
    expect((await listKits()).find((k) => k.kitNumber === 2)?.pakal).toMatchObject({ name: "נגביסט" });
  });

  it("only an admin marks a kit, and the mark stays with the bag (return, next deployment)", async () => {
    const { pakal, vest } = await setup();
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    const soldier = await makeSoldier();
    await assignKit(3, undefined, form({ soldierId: soldier.id }));
    await setKitPakal(3, pakal.id);
    await setKitItem(3, vest, true);
    await signKit(3, SIGNATURE);
    await returnKit(3, { soldierId: soldier.id, returned: {}, gapNotes: {} });
    expect((await getKit(3))!.pakal).toMatchObject({ id: pakal.id });

    const companyId = await homeCompany();
    const { deployment } = await scopedDb(companyId).$transaction(
      (tx) => startDeployment(tx, { companyId, name: "הבאה", mode: "empty", userId: admin.id }),
      { timeout: 30_000 },
    );
    const next = await prisma.personalKit.findUniqueOrThrow({ where: { deploymentId_kitNumber: { deploymentId: deployment.id, kitNumber: 3 } } });
    expect(next.pakalId).toBe(pakal.id);

    await loginAs("REGULAR");
    await expect(setKitPakal(3, null)).rejects.toBeInstanceOf(RedirectSignal);
  });

  it("switching an item to optional only changes what counts as missing", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    const helmet = await kitItemId("קסדה");
    expect(await setKitItemOptional(helmet, true)).toMatchObject({ ok: true });
    const soldier = await makeSoldier();
    await assignKit(5, undefined, form({ soldierId: soldier.id }));
    expect((await getKit(5))!.lines.find((l) => l.label === "קסדה")).toMatchObject({ optional: true });
    // The weapon line can't be made optional.
    expect(await setKitItemOptional(await kitItemId("נשק אישי"), true)).toMatchObject({ ok: false });
  });

  it("marking an item outside the kit as there adds it to the kit (signed kit, optional item)", async () => {
    const { vest, drums } = await setup();
    const soldier = await makeSoldier();
    await assignKit(6, undefined, form({ soldierId: soldier.id }));
    await signKit(6, SIGNATURE);
    const before = (await getKit(6))!;
    expect(line(before.lines, "וסט נגב")).toMatchObject({ baseline: 0 });

    // Found the vest and 2 drums in the bag.
    expect(await setKitItem(6, vest, true)).toMatchObject({ ok: true });
    expect(await setKitItemQuantity(6, drums, 2)).toMatchObject({ ok: true });
    const after = (await getKit(6))!;
    expect(line(after.lines, "וסט נגב")).toMatchObject({ present: true, baseline: 1 });
    expect(line(after.lines, "תופי נגב")).toMatchObject({ quantity: 2, baseline: 2 });

    // A line that is part of the kit keeps what was signed when its count changes.
    const helmet = await kitItemId("קסדה");
    await setKitItem(6, helmet, false);
    expect(line((await getKit(6))!.lines, "קסדה")).toMatchObject({ present: false, baseline: 0 });
  });

  it("before signing, an optional line follows what's in the bag (+2 drums → 2/2, back to 0 → out)", async () => {
    const { drums } = await setup();
    const soldier = await makeSoldier();
    await assignKit(8, undefined, form({ soldierId: soldier.id }));
    await setKitItemQuantity(8, drums, 1);
    await setKitItemQuantity(8, drums, 2);
    expect(line((await getKit(8))!.lines, "תופי נגב")).toMatchObject({ quantity: 2, baseline: 2 });
    await setKitItemQuantity(8, drums, 0);
    expect(line((await getKit(8))!.lines, "תופי נגב")).toMatchObject({ quantity: 0, baseline: null });
  });
});
