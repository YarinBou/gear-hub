import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assignKit, returnKit, setKitItem, signKit, updateWeapon } from "@/app/(app)/kits/actions";
import { setKitDefaultPresent } from "@/app/(app)/kits/items/actions";
import { getKit, getKitSummary } from "@/lib/queries/kits";
import { getSoldierReturnHistory } from "@/lib/queries/soldiers";
import { returnSoldierEquipment } from "@/app/(app)/roster/actions";
import { parseReturnLines, returnCheckLines } from "@/lib/kit";
import { activeDeployment, form, kitItemId, kitLine, loginAs, makeItem, makeSoldier, stateOf } from "./factories";

// זיכוי ערכה: what the soldier signed for vs what came back; gaps are recorded, then the form resets.

const SIGNATURE = "data:image/png;base64,AAAA";

async function kitId(kitNumber: number) {
  const d = await activeDeployment();
  return (await prisma.personalKit.findFirstOrThrow({ where: { deploymentId: d.id, kitNumber } })).id;
}

/** Kit n issued to a new soldier with a helmet, a sleeping bag, 7 magazines and 210 rounds (they start full), signed. */
async function issuedKit(n: number, weaponId?: string) {
  await activeDeployment();
  const soldier = await makeSoldier({ name: "יוסי לוי" });
  expect(await assignKit(n, undefined, form({ soldierId: soldier.id }))).toMatchObject({ ok: true });
  for (const label of ["קסדה", "שק שינה"]) await setKitItem(n, await kitItemId(label), true);
  expect(
    await updateWeapon(n, undefined, form({ rifleType: "M4", personalWeaponId: weaponId ?? "" })),
  ).toMatchObject({ ok: true });
  expect(await signKit(n, SIGNATURE)).toMatchObject({ ok: true });
  return { soldier, id: await kitId(n) };
}

describe("kit return (זיכוי ערכה)", () => {
  it("the check lists what was signed for — never the weapon itself", async () => {
    await loginAs("REGULAR");
    await issuedKit(3);
    const kit = (await getKit(3))!;
    const check = returnCheckLines(kit.lines);
    // Magazines and rounds are checklist lines (group "תחמושת") — signed for and checked like the rest.
    expect(check.map((c) => [c.label, c.expected])).toEqual([
      ["מחסניות", 7],
      ["כדורים", 210],
      ["שק שינה", 1],
      ["קסדה", 1],
    ]);
  });

  it("everything back: recorded without gaps, and the form is reset", async () => {
    await loginAs("REGULAR");
    const rifle = await makeItem();
    const { soldier, id } = await issuedKit(4, rifle.id);
    const helmet = await kitItemId("קסדה");
    const bag = await kitItemId("שק שינה");
    const [mag, ammo] = [await kitItemId("מחסניות"), await kitItemId("כדורים")];

    const r = await returnKit(4, { soldierId: soldier.id, returned: { [helmet]: 1, [bag]: 1, [mag]: 7, [ammo]: 210 }, gapNotes: {} });
    expect(r).toMatchObject({ ok: true, gaps: 0 });
    expect(r.message).toMatch(/^הערכה זוכתה — הכל חזר/);

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
    });
    // The checklist keeps what came back (no baseline — nobody has signed for it now).
    expect(await kitLine(id, "קסדה")).toMatchObject({ present: true, baseline: null });
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
    const [mag, ammo] = [await kitItemId("מחסניות"), await kitItemId("כדורים")];

    const r = await returnKit(6, {
      soldierId: soldier.id,
      returned: { [helmet]: 1, [bag]: 0, [mag]: 5, [ammo]: 999 },
      gapNotes: { [bag]: "  אובדן  ", [mag]: "נהרסו", [helmet]: "ignored — no gap" },
      note: "זיכוי בסוף תעסוקה",
    });
    expect(r).toMatchObject({ ok: true, gaps: 2 });

    const ret = await prisma.kitReturn.findFirstOrThrow({ where: { kitId: id } });
    expect(ret).toMatchObject({ gapCount: 2, note: "זיכוי בסוף תעסוקה" });
    expect(parseReturnLines(ret.lines)).toEqual([
      { label: "מחסניות", expected: 7, returned: 5, note: "נהרסו" },
      // More than signed for is capped.
      { label: "כדורים", expected: 210, returned: 210 },
      { label: "שק שינה", expected: 1, returned: 0, note: "אובדן" },
      { label: "קסדה", expected: 1, returned: 1 },
    ]);
    // The returned kit keeps the 5 magazines that came back.
    expect(await kitLine(id, "מחסניות")).toMatchObject({ quantity: 5 });
    expect((await prisma.personalKit.findUniqueOrThrow({ where: { id } })).soldierId).toBeNull();
    expect((await getKit(6))!.returns).toHaveLength(1);
  });

  it("the returned kit keeps its real contents, and start settings don't overwrite it", async () => {
    await loginAs("ADMIN");
    const { soldier, id } = await issuedKit(9);
    const helmet = await kitItemId("קסדה");
    const bag = await kitItemId("שק שינה");
    const [mag, ammo] = [await kitItemId("מחסניות"), await kitItemId("כדורים")];
    await returnKit(9, { soldierId: soldier.id, returned: { [helmet]: 1, [bag]: 0, [mag]: 7, [ammo]: 210 }, gapNotes: {} });

    expect(await kitLine(id, "קסדה")).toMatchObject({ present: true });
    expect(await kitLine(id, "שק שינה")).toMatchObject({ present: false });

    // "הכל קיים" on the checklist settings applies to never-issued kits only.
    await setKitItem(10, bag, false); // a never-issued kit, with its checklist rows
    expect(await setKitDefaultPresent(true)).toMatchObject({ ok: true });
    expect(await kitLine(id, "שק שינה")).toMatchObject({ present: false });
    expect(await kitLine(await kitId(10), "שק שינה")).toMatchObject({ present: true });

    // The totals count what is in the returned kit as stock.
    const summary = await getKitSummary();
    expect(summary.stockKits).toBe(1);
    expect(summary.lines.find((l) => l.label === "קסדה")).toMatchObject({ stock: 1 });
    expect(summary.lines.find((l) => l.label === "שק שינה")).toMatchObject({ stock: 0 });

    // Issuing it again starts from what is really in it.
    const next = await makeSoldier({ name: "הבא" });
    expect(await assignKit(9, undefined, form({ soldierId: next.id }))).toMatchObject({ ok: true });
    expect(await kitLine(id, "קסדה")).toMatchObject({ present: true });
    expect(await kitLine(id, "שק שינה")).toMatchObject({ present: false });
  });

  it("refuses a kit that isn't issued, or was moved to another soldier since", async () => {
    await loginAs("REGULAR");
    const { soldier } = await issuedKit(7);
    const other = await makeSoldier({ name: "אחר" });
    expect(await returnKit(8, { soldierId: soldier.id, returned: {}, gapNotes: {} })).toMatchObject({ ok: false });
    expect(await returnKit(7, { soldierId: other.id, returned: {}, gapNotes: {} })).toMatchObject({ ok: false });
    expect(await prisma.kitReturn.count()).toBe(0);
  });

  it("the soldier's page shows what they signed for and returned (kit lines and צל\"ם)", async () => {
    await loginAs("REGULAR");
    const rifle = await makeItem();
    const { soldier } = await issuedKit(11, rifle.id);
    const helmet = await kitItemId("קסדה");
    const bag = await kitItemId("שק שינה");
    const [mag, ammo] = [await kitItemId("מחסניות"), await kitItemId("כדורים")];
    await returnKit(11, { soldierId: soldier.id, returned: { [helmet]: 1, [bag]: 0, [mag]: 7, [ammo]: 210 }, gapNotes: { [bag]: "אובדן" } });
    await returnSoldierEquipment(soldier.id, [rifle.id]);

    const h = await getSoldierReturnHistory(soldier.id);
    expect(h.kitReturns).toHaveLength(1);
    expect(h.kitReturns[0]).toMatchObject({ gapCount: 1, kit: { kitNumber: 11 } });
    expect(h.kitReturns[0].lines).toContainEqual({ label: "שק שינה", expected: 1, returned: 0, note: "אובדן" });
    expect(h.kitReturns[0].lines).toContainEqual({ label: "מחסניות", expected: 7, returned: 7 });
    expect(h.equipmentReturns.map((e) => [e.item.id, e.toStatus])).toEqual([[rifle.id, "STORED"]]);

    // Another soldier's history is separate.
    const other = await makeSoldier({ name: "אחר" });
    expect(await getSoldierReturnHistory(other.id)).toEqual({ kitReturns: [], equipmentReturns: [] });
  });
});
