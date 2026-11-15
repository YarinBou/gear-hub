import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { setPresence } from "@/app/(app)/roster/actions";
import { assignEquipment, createEquipment, signSetAction } from "@/app/(app)/equipment/actions";
import { assignKit } from "@/app/(app)/kits/actions";
import { startDeploymentAction } from "@/app/(app)/deployments/actions";
import { getRosterCounts, getSoldierOptions, listSoldiers } from "@/lib/queries/soldiers";
import { RedirectSignal } from "./auth-mock";
import { activeDeployment, form, homeCompany, loginAs, makeCategory, makeCompany, makeItem, makeSoldier, stateOf } from "./factories";

// Per-deployment participation: everyone on the roster is in the deployment unless marked out.

describe("who is in the deployment", () => {
  it("a soldier marked out disappears from pickers and can't be signed anything", async () => {
    await loginAs("REGULAR");
    await activeDeployment();
    const [inside, outside] = [await makeSoldier({ name: "בפנים" }), await makeSoldier({ name: "בחוץ" })];
    expect(await setPresence([outside.id], false)).toMatchObject({ ok: true });

    expect((await getSoldierOptions()).map((s) => s.id)).toEqual([inside.id]);
    expect(await getRosterCounts()).toMatchObject({ total: 2, out: 1 });
    const rows = await listSoldiers({ presence: "out" });
    expect(rows.map((r) => r.id)).toEqual([outside.id]);
    expect(rows[0].inDeployment).toBe(false);

    const rifle = await makeItem();
    expect(await assignEquipment(rifle.id, undefined, form({ soldierId: outside.id }))).toHaveProperty("error");
    expect(await stateOf(rifle.id)).toMatchObject({ assignedSoldierId: null });
    expect(await assignKit(1, undefined, form({ soldierId: outside.id }))).toHaveProperty("error");
    const cat = await makeCategory();
    expect(await createEquipment(undefined, form({ categoryId: cat.id, serials: "X-1", soldierId: outside.id }))).toHaveProperty(
      "errors.soldierId",
    );

    const set = await prisma.equipmentSet.create({
      data: { companyId: await homeCompany(), name: "מארז", mainCategoryId: cat.id, slots: { create: [{ companyId: await homeCompany(), categoryId: cat.id }] } },
    });
    const main = await makeItem({ categoryId: cat.id });
    expect(await signSetAction({ setId: set.id, soldierId: outside.id, mainItemId: main.id, componentIds: [], newComponentCategoryIds: [] })).toMatchObject({
      ok: false,
    });

    // Back in: everything works again.
    await setPresence([outside.id], true);
    expect(await assignEquipment(rifle.id, undefined, form({ soldierId: outside.id }))).toMatchObject({ ok: true });
  });

  it("someone holding equipment or a kit can't be taken out", async () => {
    await loginAs("REGULAR");
    await activeDeployment();
    const holder = await makeSoldier();
    await makeItem({ assignedSoldierId: holder.id, status: "WITH_SOLDIER" });
    const r = await setPresence([holder.id], false);
    expect(r.message).toContain("דולגו");
    expect(await prisma.deploymentAbsence.count()).toBe(0);
  });

  it("'copy' carries who is out into the next deployment; 'empty' starts with everyone in", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    const out = await makeSoldier();
    await setPresence([out.id], false);

    await expect(startDeploymentAction(undefined, form({ name: "שנייה", mode: "copy" }))).rejects.toBeInstanceOf(RedirectSignal);
    const second = await prisma.deployment.findFirstOrThrow({ where: { name: "שנייה" } });
    expect(await prisma.deploymentAbsence.count({ where: { deploymentId: second.id, soldierId: out.id } })).toBe(1);

    await expect(startDeploymentAction(undefined, form({ name: "שלישית", mode: "empty" }))).rejects.toBeInstanceOf(RedirectSignal);
    const third = await prisma.deployment.findFirstOrThrow({ where: { name: "שלישית" } });
    expect(await prisma.deploymentAbsence.count({ where: { deploymentId: third.id } })).toBe(0);
  });

  it("can't mark another company's soldier", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    const other = await makeCompany({ name: "אחרת" });
    const theirs = await makeSoldier({ companyId: other.id });
    await setPresence([theirs.id], false);
    expect(await prisma.deploymentAbsence.count()).toBe(0);
  });
});
