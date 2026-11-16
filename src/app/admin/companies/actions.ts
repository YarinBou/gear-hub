"use server";

import { refresh, revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireSuperAdmin, setActiveCompany } from "@/lib/auth";
import { provisionCompany } from "@/lib/company-setup";
import { copyCompanySetup, type CopySetupResult } from "@/lib/company-template";
import { catalogTag } from "@/lib/queries/catalog";
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
    templateId: fd.get("templateId") ?? "",
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const { name, adminName, adminUsername, templateId } = parsed.data;
  const template = templateId
    ? await prisma.company.findUnique({ where: { id: templateId }, select: { id: true, name: true } })
    : null;
  if (templateId && !template) return { errors: { templateId: "פלוגה לא קיימת" } };

  const [nameTaken, usernameTaken] = await Promise.all([
    prisma.company.findUnique({ where: { name }, select: { id: true } }),
    prisma.user.findUnique({ where: { username: adminUsername }, select: { id: true } }),
  ]);
  if (nameTaken) return { errors: { name: "כבר קיימת פלוגה בשם זה" } };
  if (usernameTaken) return { errors: { adminUsername: "שם המשתמש תפוס" } };

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  let companyId: string;
  try {
    companyId = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name } });
      await provisionCompany(tx, company.id, { defaults: !template });
      await tx.user.create({
        data: { companyId: company.id, name: adminName, username: adminUsername, role: "ADMIN", passwordHash },
      });
      return company.id;
    });
  } catch (e) {
    // Lost a race with a concurrent create of the same name / username.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "שם הפלוגה או שם המשתמש כבר תפוסים. נסו שוב." };
    }
    throw e;
  }
  let copied = "";
  if (template) {
    const r = await copyCompanySetup(template.id, companyId);
    copied = ` עם ההגדרות של "${template.name}" (${describeCopy(r)})`;
  }
  refresh();
  return {
    ok: true,
    message: `הפלוגה "${name}" נוצרה${copied}`,
    tempPassword: { username: adminUsername, password },
    at: Date.now(),
  };
}

function describeCopy(r: CopySetupResult) {
  return `${r.categories} סוגים בקטלוג, ${r.sets} מארזים, ${r.kitItems} שורות ערכה`;
}

/**
 * Copy another company's catalog, sets (מארזים) and kit checklist into a company as a starting
 * point. Merge: only what's missing is added (by name); no items, serials or personal data.
 */
export async function copySetup(targetId: string, sourceId: string): Promise<{ ok: boolean; message: string }> {
  await requireSuperAdmin();
  if (!sourceId || sourceId === targetId) return { ok: false, message: "יש לבחור פלוגת מקור אחרת" };
  const [source, target] = await Promise.all([
    prisma.company.findUnique({ where: { id: sourceId }, select: { id: true, name: true } }),
    prisma.company.findUnique({ where: { id: targetId }, select: { id: true, name: true } }),
  ]);
  if (!source || !target) return { ok: false, message: "פלוגה לא קיימת" };
  const r = await copyCompanySetup(source.id, target.id);
  updateTag(catalogTag(target.id));
  refresh();
  const total = r.categories + r.sets + r.kitItems;
  return {
    ok: true,
    message: total
      ? `הועתקו מ"${source.name}" אל "${target.name}": ${describeCopy(r)}.`
      : `לא נוסף דבר — כל מה שיש ב"${source.name}" כבר קיים ב"${target.name}".`,
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
