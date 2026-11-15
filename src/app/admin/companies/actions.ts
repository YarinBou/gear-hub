"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireSuperAdmin, setActiveCompany } from "@/lib/auth";
import { provisionCompany } from "@/lib/company-setup";
import { generateTempPassword, hashPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";
import { CreateCompanySchema } from "@/lib/validation/company";

// Super-admin only. These work across companies, so they use the unscoped client on purpose.

export type CompanyFormState =
  | {
      ok?: boolean;
      message?: string;
      error?: string;
      errors?: FieldErrors;
      /** The new admin's temporary password — shown once, never stored in plain text. */
      tempPassword?: { username: string; password: string };
      at?: number;
    }
  | undefined;

/** Create a company with its default catalog, platoons, kit count (98, editable), and its first admin. */
export async function createCompany(_prev: CompanyFormState, fd: FormData): Promise<CompanyFormState> {
  await requireSuperAdmin();
  const parsed = CreateCompanySchema.safeParse({
    name: fd.get("name") ?? "",
    adminName: fd.get("adminName") ?? "",
    adminUsername: fd.get("adminUsername") ?? "",
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const { name, adminName, adminUsername } = parsed.data;

  const [nameTaken, usernameTaken] = await Promise.all([
    prisma.company.findUnique({ where: { name }, select: { id: true } }),
    prisma.user.findUnique({ where: { username: adminUsername }, select: { id: true } }),
  ]);
  if (nameTaken) return { errors: { name: "כבר קיימת פלוגה בשם זה" } };
  if (usernameTaken) return { errors: { adminUsername: "שם המשתמש תפוס" } };

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  try {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name } });
      await provisionCompany(tx, company.id);
      await tx.user.create({
        data: { companyId: company.id, name: adminName, username: adminUsername, role: "ADMIN", passwordHash },
      });
    });
  } catch (e) {
    // Lost a race with a concurrent create of the same name / username.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "שם הפלוגה או שם המשתמש כבר תפוסים. נסו שוב." };
    }
    throw e;
  }
  refresh();
  return {
    ok: true,
    message: `הפלוגה "${name}" נוצרה`,
    tempPassword: { username: adminUsername, password },
    at: Date.now(),
  };
}

/** Deactivating a company signs its users out on their next request. Data is kept. */
export async function setCompanyActive(companyId: string, active: boolean): Promise<{ ok: boolean }> {
  await requireSuperAdmin();
  await prisma.company.update({ where: { id: companyId }, data: { isActive: active } });
  refresh();
  return { ok: true };
}

/**
 * Work inside a company (the whole app then shows that company only). The caller then does a full
 * page load of "/": a redirect from here would render "/" inside this same response, with the
 * request's old cookies (no company yet), and bounce straight back to /admin/companies.
 */
export async function enterCompany(companyId: string): Promise<{ ok: boolean }> {
  await requireSuperAdmin();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) return { ok: false };
  await setActiveCompany(company.id);
  // The whole app renders for a different company / deployment now: purge the client router cache,
  // otherwise pages fetched before (e.g. a cached redirect) are reused. (Next docs: revalidatePath)
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function leaveCompany() {
  await setActiveCompany(null);
  // The whole app renders for a different company / deployment now: purge the client router cache,
  // otherwise pages fetched before (e.g. a cached redirect) are reused. (Next docs: revalidatePath)
  revalidatePath("/", "layout");
  redirect("/admin/companies");
}
