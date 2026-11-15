import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isCompanyAdmin } from "@/lib/roles";
import {
  ACTIVE_COMPANY_COOKIE,
  decryptSession,
  encryptSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionPayload,
} from "@/lib/session";
import type { Role } from "@/generated/prisma/enums";
import { platoonSelect, type PlatoonRef } from "@/lib/platoons";

// Data Access Layer: the real authorization checks live here (not in the proxy).
//
// requireSessionUser()  any signed-in, active user (a SUPER_ADMIN may have no company yet)
// requireUser()         a user acting inside a company — every company page/action uses this
// requireAdmin()        requireUser() + company admin (ADMIN, or a SUPER_ADMIN working in a company)
// requireSuperAdmin()   SUPER_ADMIN only (company management)
//
// A SUPER_ADMIN belongs to no company. They pick one on /admin/companies; the choice is kept in
// ACTIVE_COMPANY_COOKIE and re-checked against the database on every request.
// Pair these with scopedDb(user.companyId) — see src/lib/context.ts.

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  platoon: PlatoonRef | null;
  companyId: string | null;
};

/** A user acting inside one company. */
export type AppUser = Omit<SessionUser, "companyId"> & { companyId: string; companyName: string };

export async function createSession(payload: SessionPayload) {
  const token = await encryptSession(payload);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ACTIVE_COMPANY_COOKIE);
}

export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return decryptSession(token);
});

/** Current active user, or redirect to /login. Re-checks the DB so deactivated users (and companies) are cut off. */
export const requireSessionUser = cache(async (): Promise<SessionUser> => {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      platoon: platoonSelect,
      isActive: true,
      companyId: true,
      company: { select: { isActive: true } },
    },
  });
  if (!user || !user.isActive) redirect("/login");
  if (user.role !== "SUPER_ADMIN" && !user.company?.isActive) redirect("/login");
  const { isActive: _a, company: _c, ...rest } = user;
  return rest;
});

/** The signed-in user together with the company they're acting in. */
export const requireUser = cache(async (): Promise<AppUser> => {
  const user = await requireSessionUser();
  const companyId =
    user.role === "SUPER_ADMIN" ? (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value : user.companyId;
  const company = companyId
    ? await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, isActive: true } })
    : null;
  if (!company || (user.role !== "SUPER_ADMIN" && !company.isActive)) {
    redirect(user.role === "SUPER_ADMIN" ? "/admin/companies" : "/login");
  }
  return { ...user, companyId: company.id, companyName: company.name };
});

export async function requireAdmin() {
  const user = await requireUser();
  if (!isCompanyAdmin(user.role)) redirect("/");
  return user;
}

export async function requireSuperAdmin() {
  const user = await requireSessionUser();
  if (user.role !== "SUPER_ADMIN") redirect("/");
  return user;
}

/** SUPER_ADMIN only: switch the company they're working in. Call from a Server Action. */
export async function setActiveCompany(companyId: string | null) {
  await requireSuperAdmin();
  const jar = await cookies();
  if (!companyId) {
    jar.delete(ACTIVE_COMPANY_COOKIE);
    return;
  }
  jar.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}
