import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { setKitCount } from "@/app/(app)/kits/items/actions";
import { assignKit } from "@/app/(app)/kits/actions";
import { startDeploymentAction } from "@/app/(app)/deployments/actions";
import { listKits } from "@/lib/queries/kits";
import { RedirectSignal } from "./auth-mock";
import { activeDeployment, form, homeCompany, loginAs, makeSoldier } from "./factories";

// Each company sets how many personal kits it has (was a fixed 98).

const kitsIn = async (deploymentId: string) =>
  (await prisma.personalKit.findMany({ where: { deploymentId }, orderBy: { kitNumber: "asc" } })).map((k) => k.kitNumber);

describe("kit count", () => {
  it("growing adds kits (with their checklist) to the active deployment", async () => {
    await loginAs("ADMIN");
    const dep = await activeDeployment();
    expect(await setKitCount(5)).toMatchObject({ ok: true });
    expect(await kitsIn(dep.id)).toEqual([1, 2, 3, 4, 5]);
    const kit = await prisma.personalKit.findFirstOrThrow({ where: { deploymentId: dep.id, kitNumber: 5 } });
    expect(await prisma.kitItemStatus.count({ where: { kitId: kit.id } })).toBeGreaterThan(0);
    expect(await listKits()).toHaveLength(5);
  });

  it("shrinking is refused while a kit above the new count is issued, then removes the extra kits", async () => {
    await loginAs("ADMIN");
    const dep = await activeDeployment();
    await setKitCount(5);
    const soldier = await makeSoldier();
    await assignKit(4, undefined, form({ soldierId: soldier.id }));

    expect(await setKitCount(2)).toMatchObject({ ok: false });
    expect(await kitsIn(dep.id)).toHaveLength(5);

    await assignKit(4, undefined, form({ soldierId: "" }));
    expect(await setKitCount(2)).toMatchObject({ ok: true });
    expect(await kitsIn(dep.id)).toEqual([1, 2]);
    await expect(assignKit(3, undefined, form({ soldierId: soldier.id }))).rejects.toThrow();
  });

  it("a new deployment gets the company's count; only admins change it; out-of-range is refused", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    expect(await setKitCount(0)).toMatchObject({ ok: false });
    expect(await setKitCount(501)).toMatchObject({ ok: false });
    await setKitCount(3);

    await expect(startDeploymentAction(undefined, form({ name: "חדשה", mode: "empty" }))).rejects.toBeInstanceOf(RedirectSignal);
    const next = await prisma.deployment.findFirstOrThrow({ where: { companyId: await homeCompany(), status: "ACTIVE" } });
    expect(await kitsIn(next.id)).toEqual([1, 2, 3]);

    await loginAs("REGULAR");
    await expect(setKitCount(10)).rejects.toThrow();
  });
});
