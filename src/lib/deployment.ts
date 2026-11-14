import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { scopedDb } from "@/lib/db";
import { DEPLOYMENT_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import type { DeploymentStatus } from "@/generated/prisma/enums";

// Which deployment (הפעלה) the user is looking at. Defaults to the company's ACTIVE deployment;
// the header's picker can switch to a past one (kept in DEPLOYMENT_COOKIE, re-checked against the
// company every request). Null = the company has no active deployment and none was picked.
// Writes always require the viewed deployment to be ACTIVE — see writableContext() in context.ts.

export type ViewedDeployment = {
  id: string;
  name: string;
  status: DeploymentStatus;
  startedAt: Date;
  endedAt: Date | null;
  /** A closed deployment is a read-only history. */
  readOnly: boolean;
};

const select = { id: true, name: true, status: true, startedAt: true, endedAt: true } as const;

export const getViewedDeployment = cache(async (companyId: string): Promise<ViewedDeployment | null> => {
  const db = scopedDb(companyId);
  const chosen = (await cookies()).get(DEPLOYMENT_COOKIE)?.value;
  const d =
    (chosen ? await db.deployment.findFirst({ where: { id: chosen }, select }) : null) ??
    (await db.deployment.findFirst({ where: { status: "ACTIVE" }, select }));
  return d ? { ...d, readOnly: d.status !== "ACTIVE" } : null;
});

/** Look at a specific deployment (null = back to the active one). Call from a Server Action. */
export async function setViewedDeployment(deploymentId: string | null) {
  const jar = await cookies();
  if (!deploymentId) {
    jar.delete(DEPLOYMENT_COOKIE);
    return;
  }
  jar.set(DEPLOYMENT_COOKIE, deploymentId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}
