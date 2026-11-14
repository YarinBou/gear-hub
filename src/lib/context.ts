import "server-only";
import { requireAdmin, requireUser } from "@/lib/auth";
import { scopedDb } from "@/lib/db";

// The usual entry point for company pages, queries and server actions:
//   const { user, db } = await companyContext();
// `db` only ever sees the user's company (see src/lib/db.ts).

export async function companyContext() {
  const user = await requireUser();
  return { user, db: scopedDb(user.companyId) };
}

export async function adminContext() {
  const user = await requireAdmin();
  return { user, db: scopedDb(user.companyId) };
}
