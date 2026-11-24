import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { scopedDb } from "@/lib/db";
import { startDeployment } from "@/lib/deployment-service";
import { addSoldierItem, returnSoldierItems, setPresence } from "@/app/(app)/roster/actions";
import { getKitSummary } from "@/lib/queries/kits";
import { getSoldier, getSoldierReturnHistory } from "@/lib/queries/soldiers";
import { activeDeployment, homeCompany, kitItemId, loginAs, makeSoldier } from "./factories";

// פריטים מחוץ לתיק: checklist items handed to a soldier separately from any kit.

describe("items outside the kit", () => {
  it("adds from the checklist (same item adds up), returns with gaps into the history", async () => {
    await loginAs("REGULAR");
    await activeDeployment();
    const soldier = await makeSoldier({ name: "מטולאי" });
    const bag = await kitItemId("שק שינה");
    const mags = await kitItemId("מחסניות");

    expect(await addSoldierItem(soldier.id, bag, 1, "נמסר בשטח")).toMatchObject({ ok: true });
    expect(await addSoldierItem(soldier.id, mags, 3, "")).toMatchObject({ ok: true });
    expect(await addSoldierItem(soldier.id, mags, 2, "")).toMatchObject({ ok: true });
    const s = (await getSoldier(soldier.id))!;
    expect(s.looseItems.map((r) => [r.item.label, r.quantity])).toEqual(
      expect.arrayContaining([
        ["שק שינה", 1],
        ["מחסניות", 5],
      ]),
    );

    // The summary counts them separately ("מחוץ לתיק").
    const summary = await getKitSummary();
    expect(summary.lines.find((l) => l.label === "מחסניות")).toMatchObject({ loose: 5 });

    // Return the magazines: 4 of 5 came back.
    const magsRow = s.looseItems.find((r) => r.item.label === "מחסניות")!;
    const r = await returnSoldierItems(soldier.id, { returned: { [magsRow.id]: 4 }, gapNotes: { [magsRow.id]: "אובדן" } });
    expect(r).toMatchObject({ ok: true });
    expect(r.message).toContain("פער");
    expect((await getSoldier(soldier.id))!.looseItems.map((x) => x.item.label)).toEqual(["שק שינה"]);
    const h = await getSoldierReturnHistory(soldier.id);
    expect(h.looseReturns[0].lines).toEqual([{ label: "מחסניות", expected: 5, returned: 4, note: "אובדן" }]);
  });

  it("only items from the list, not the weapon line, with a valid quantity", async () => {
    await loginAs("REGULAR");
    await activeDeployment();
    const soldier = await makeSoldier();
    expect(await addSoldierItem(soldier.id, await kitItemId("נשק אישי"), 1, "")).toMatchObject({ ok: false });
    expect(await addSoldierItem(soldier.id, "nope", 1, "")).toMatchObject({ ok: false });
    expect(await addSoldierItem(soldier.id, await kitItemId("קסדה"), 0, "")).toMatchObject({ ok: false });
  });

  it("a soldier holding items can't be taken out of the deployment; 'copy' carries the items over", async () => {
    const admin = await loginAs("ADMIN");
    const first = await activeDeployment();
    const soldier = await makeSoldier();
    await addSoldierItem(soldier.id, await kitItemId("שק שינה"), 1, "");
    const out = await setPresence([soldier.id], false);
    expect(out.message).toContain("דולגו");
    expect(await prisma.deploymentAbsence.count({ where: { soldierId: soldier.id } })).toBe(0);

    const companyId = await homeCompany();
    const { deployment } = await scopedDb(companyId).$transaction(
      (tx) => startDeployment(tx, { companyId, name: "הבאה", mode: "copy", userId: admin.id }),
      { timeout: 30_000 },
    );
    expect(await prisma.soldierItem.count({ where: { deploymentId: deployment.id, soldierId: soldier.id } })).toBe(1);
    expect(first.id).not.toBe(deployment.id);
  });
});
