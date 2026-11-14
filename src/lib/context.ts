import "server-only";
import { requireAdmin, requireUser, type AppUser } from "@/lib/auth";
import { scopedDb } from "@/lib/db";
import { getViewedDeployment, type ViewedDeployment } from "@/lib/deployment";
import type { PrismaClient } from "@/generated/prisma/client";

// The usual entry point for company pages, queries and server actions:
//   const { user, db, deployment } = await companyContext();
// `db` only ever sees the user's company, and for deployment-level data (assignments, kits,
// ammo) only the deployment being viewed — nothing at all when there is none (see src/lib/db.ts).
//
// Server actions that change deployment-level data use writableContext(): it refuses when there
// is no deployment or the viewed one is closed (read-only history).

export type Context = { user: AppUser; db: PrismaClient; deployment: ViewedDeployment | null };

async function build(user: AppUser): Promise<Context> {
  const deployment = await getViewedDeployment(user.companyId);
  return { user, deployment, db: scopedDb(user.companyId, deployment?.id ?? null) };
}

export async function companyContext() {
  return build(await requireUser());
}

export async function adminContext() {
  return build(await requireAdmin());
}

export const NO_DEPLOYMENT_MESSAGE = "אין הפעלה פעילה. ניתן לפתוח הפעלה חדשה במסך ההפעלות.";

export function readOnlyMessage(name: string) {
  return `ההפעלה "${name}" הסתיימה — צפייה בלבד.`;
}

export type WritableContext =
  | ({ ok: true } & Context & { deployment: ViewedDeployment })
  | { ok: false; message: string };

/** Context for writes to deployment-level data: the viewed deployment must exist and be ACTIVE. */
export async function writableContext(opts: { admin?: boolean } = {}): Promise<WritableContext> {
  const ctx = opts.admin ? await adminContext() : await companyContext();
  if (!ctx.deployment) return { ok: false, message: NO_DEPLOYMENT_MESSAGE };
  if (ctx.deployment.readOnly) return { ok: false, message: readOnlyMessage(ctx.deployment.name) };
  return { ok: true, ...ctx, deployment: ctx.deployment };
}
