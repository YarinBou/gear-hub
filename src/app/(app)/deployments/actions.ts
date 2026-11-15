"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { adminContext, companyContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { setViewedDeployment } from "@/lib/deployment";
import { closeDeployment, DeploymentError, startDeployment } from "@/lib/deployment-service";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

export type DeploymentFormState = { ok?: boolean; message?: string; error?: string; errors?: FieldErrors; at?: number } | undefined;

const StartSchema = z.object({
  name: z.string().trim().min(2, "יש להזין שם להפעלה").max(60, "השם ארוך מדי"),
  mode: z.enum(["copy", "empty"], { error: "יש לבחור איך להתחיל" }),
});

/** Admin: start a new deployment (closes the current one). */
export async function startDeploymentAction(_prev: DeploymentFormState, fd: FormData): Promise<DeploymentFormState> {
  const { user } = await adminContext();
  const parsed = StartSchema.safeParse({ name: fd.get("name") ?? "", mode: fd.get("mode") ?? "" });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  try {
    // Company-level client: this reads the previous deployment and writes the new one.
    await scopedDb(user.companyId).$transaction(
      (tx) => startDeployment(tx, { companyId: user.companyId, userId: user.id, ...parsed.data }),
      { timeout: 30_000 },
    );
  } catch (e) {
    if (e instanceof DeploymentError) return { errors: { name: e.message } };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "הפעלה אחרת נפתחה בדיוק עכשיו. רעננו את הדף ונסו שוב." };
    }
    throw e;
  }
  await setViewedDeployment(null); // look at the new, active one
  // The whole app renders for a different company / deployment now: purge the client router cache,
  // otherwise pages fetched before (e.g. a cached redirect) are reused. (Next docs: revalidatePath)
  revalidatePath("/", "layout");
  redirect("/");
}

/** Admin: end the active deployment. It stays available as a read-only history. */
export async function closeDeploymentAction(deploymentId: string): Promise<{ ok: boolean; message?: string }> {
  const { user } = await adminContext();
  try {
    await closeDeployment(scopedDb(user.companyId), deploymentId);
  } catch (e) {
    if (e instanceof DeploymentError) return { ok: false, message: e.message };
    throw e;
  }
  await setViewedDeployment(null);
  // The whole app renders for a different company / deployment now: purge the client router cache,
  // otherwise pages fetched before (e.g. a cached redirect) are reused. (Next docs: revalidatePath)
  revalidatePath("/", "layout");
  return { ok: true, message: "ההפעלה הסתיימה ונשמרה בהיסטוריה" };
}

/** Anyone: look at another deployment (null = the active one). Must belong to the user's company. */
export async function viewDeployment(deploymentId: string | null) {
  const { db } = await companyContext();
  if (deploymentId) {
    const d = await db.deployment.findUnique({ where: { id: deploymentId }, select: { id: true } });
    if (!d) return;
  }
  await setViewedDeployment(deploymentId);
  // The whole app renders for a different company / deployment now: purge the client router cache,
  // otherwise pages fetched before (e.g. a cached redirect) are reused. (Next docs: revalidatePath)
  revalidatePath("/", "layout");
}
