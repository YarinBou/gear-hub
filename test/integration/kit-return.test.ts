import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assignKit, returnKit, setKitItem, signKit, updateWeapon } from "@/app/(app)/kits/actions";
import { getKit } from "@/lib/queries/kits";
import { parseReturnLines, returnCheckLines } from "@/lib/kit";
import { activeDeployment, form, kitItemId, kitLine, loginAs, makeItem, makeSoldier, stateOf } from "./factories";

// זיכוי ערכה: what the soldier signed for vs what came back; gaps are recorded, then the form resets.

const SIGNATURE = "data:image/png;base64,AAAA";

async function kitId(kitNumber: number) {
  const d = await activeDeployment();
  return (await prisma.personalKit.findFirstOrThrow({ where: { deploymentId: d.id, kitNumber } })).id;
}

/** Kit n issued to a new soldier with a helmet, a sleeping bag and 7 magazines on the weapon card, signed. */
async function issuedKit(n: number, weaponId?: string) {
  await activeDeployment();
  const soldier = await makeSoldier({ name: "יוסי לוי" });
  expect(await assignKit(n, undefined, form({ soldierId: soldier.id }))).toMatchObject({ ok: true });
  for (const label of ["קסדה", "שק שינה"]) await setKitItem(n, await kitItemId(label), true);
  expect(
    await updateWeapon(n, undefined, form({ rifleType: "M4", personalWeaponId: weaponId ?? "", magazineCount: 7, ammoCount: 210 })),
  ).toMatchObject({ ok: true });
  expect(await signKit(n, SIGNATURE)).toMatchObject({ ok: true });
  return { soldier, id: await kitId(n) };
}

describe("kit return (זיכוי ערכה)", () => {
  it("the check lists what was signed for — never the weapon itself", async () => {
    await loginAs("REGULAR");
    await issuedKit(3);
    const kit = (await getKit(3))!;
    const check = returnCheckLines(kit.lines, kit);
    expect(check.map((c) => [c.label, c.expected])).toEqual([
      ["שק שינה", 1],
      ["קסדה", 1],
      ["מחסניות", 7],
      ["כדורים", 210],
    ]);
  });

  it("everything back: recorded without gaps, and the form is reset", async () => {
    await loginAs("REGULAR");
    const rifle = await makeItem();
    const { soldier, id } = await issuedKit(4, rifle.id);
    const helmet = await kitItemId("קסדה");
    const bag = await kitItemId("שק שינה");

    const r = await returnKit(4, { soldierId: soldier.id, returned: { [helmet]: 1, [bag]: 1, mag: 7, ammo: 210 }, gapNotes: {} });
    expect(r).toMatchObject({ ok: true, gaps: 0, message: "הערכה זוכתה — הכל חזר" });

    const ret = await prisma.kitReturn.findFirstOrThrow({ where: { kitId: id } });
    expect(ret).toMatchObject({ soldierId: soldier.id, soldierName: "יוסי לוי", gapCount: 0 });
    expect(parseReturnLines(ret.lines)).toHaveLength(4);

    const kit = await prisma.personalKit.findUniqueOrThrow({ where: { id } });
    expect(kit).toMatchObject({
      soldierId: null,
      signedAt: null,
      signatureData: null,
      personalWeaponId: null,
      rifleType: null,
      magazineCount: 0,
      ammoCount: 0,
      extraAmmo: [],
    });
    // Checklist back to its start (the default company starts lines as missing), no baseline.
    expect(await kitLine(id, "קסדה")).toMatchObject({ present: false, baseline: null });
    // The weapon itself is still with the soldier on the צל"ם side — returned separately.
    expect(await stateOf(rifle.id)).toMatchObject({ assignedSoldierId: soldier.id, status: "WITH_SOLDIER" });
    // The soldier can be issued a kit again.
    expect(await assignKit(5, undefined, form({ soldierId: soldier.id }))).toMatchObject({ ok: true });
  });

  it("gaps are recorded with their notes and don't block the return", async () => {
    await loginAs("REGULAR");
    const { soldier, id } = await issuedKit(6);
    const helmet = await kitItemId("קסדה");
    const bag = await kitItemId("שק שינה");

    const r = await returnKit(6, {
      soldierId: soldier.id,
      returned: { [helmet]: 1, [bag]: 0, mag: 5, ammo: 999 },
      gapNotes: { [bag]: "  אובדן  ", mag: "נהרסו", [helmet]: "ignored — no gap" },
      note: "זיכוי בסוף תעסוקה",
    });
    expect(r).toMatchObject({ ok: true, gaps: 2 });

    const ret = await prisma.kitReturn.findFirstOrThrow({ where: { kitId: id } });
    expect(ret).toMatchObject({ gapCount: 2, note: "זיכוי בסוף תעסוקה" });
    expect(parseReturnLines(ret.lines)).toEqual([
      { label: "שק שינה", expected: 1, returned: 0, note: "אובדן" },
      { label: "קסדה", expected: 1, returned: 1 },
      { label: "מחסניות", expected: 7, returned: 5, note: "נהרסו" },
      // More than signed for is capped.
      { label: "כדורים", expected: 210, returned: 210 },
    ]);
    expect((await prisma.personalKit.findUniqueOrThrow({ where: { id } })).soldierId).toBeNull();
    expect((await getKit(6))!.returns).toHaveLength(1);
  });

  it("refuses a kit that isn't issued, or was moved to another soldier since", async () => {
    await loginAs("REGULAR");
    const { soldier } = await issuedKit(7);
    const other = await makeSoldier({ name: "אחר" });
    expect(await returnKit(8, { soldierId: soldier.id, returned: {}, gapNotes: {} })).toMatchObject({ ok: false });
    expect(await returnKit(7, { soldierId: other.id, returned: {}, gapNotes: {} })).toMatchObject({ ok: false });
    expect(await prisma.kitReturn.count()).toBe(0);
  });
});
