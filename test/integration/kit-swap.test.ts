import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assignKit, completeContentsCheck, setKitItem, signKit, swapKitNumbers } from "@/app/(app)/kits/actions";
import { RedirectSignal } from "./auth-mock";
import { activeDeployment, form, kitItemId, kitLine, loginAs, makeSoldier } from "./factories";

const SIGNATURE = "data:image/png;base64,AAAA";

describe("swap kit numbers (תיק 2 ⇄ תיק 36)", () => {
  it("everything on each kit moves with it; only the numbers change", async () => {
    await loginAs("ADMIN");
    const d = await activeDeployment();
    const soldier = await makeSoldier({ name: "יוסי" });
    await assignKit(2, undefined, form({ soldierId: soldier.id }));
    await setKitItem(2, await kitItemId("קסדה"), true);
    await signKit(2, SIGNATURE);
    await completeContentsCheck(36, ""); // kit 36: in stock, checked

    const kit = (n: number) => prisma.personalKit.findUniqueOrThrow({ where: { deploymentId_kitNumber: { deploymentId: d.id, kitNumber: n } } });
    const [before2, before36] = [await kit(2), await kit(36)];

    expect(await swapKitNumbers(2, 36)).toMatchObject({ ok: true });
    const [now36, now2] = [await kit(36), await kit(2)];
    expect(now36.id).toBe(before2.id);
    expect(now36).toMatchObject({ soldierId: soldier.id });
    expect(now36.signedAt).not.toBeNull();
    expect(await kitLine(now36.id, "קסדה")).toMatchObject({ present: true });
    expect(now2.id).toBe(before36.id);
    expect(now2).toMatchObject({ soldierId: null });
    expect(now2.contentsCheckedAt).not.toBeNull();
  });

  it("refuses the same number or one out of range; admins only", async () => {
    await loginAs("ADMIN");
    await activeDeployment();
    expect(await swapKitNumbers(3, 3)).toMatchObject({ ok: false });
    expect(await swapKitNumbers(3, 999)).toMatchObject({ ok: false });
    await loginAs("REGULAR");
    await expect(swapKitNumbers(3, 4)).rejects.toBeInstanceOf(RedirectSignal);
  });
});
