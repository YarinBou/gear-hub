"use server";

import { updateTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { CatalogDomain } from "@/generated/prisma/enums";
import { adminContext } from "@/lib/context";
import { CATALOG_DOMAINS, catalogTag } from "@/lib/queries/catalog";
import { parseCategory } from "@/lib/validation/catalog";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

export type CategoryFormState =
  | { ok?: boolean; message?: string; error?: string; errors?: FieldErrors; at?: number }
  | undefined;

const FIELDS = ["name", "description", "ammoCategory", "minThreshold", "targetQuantity", "requiresExpiry"];

function read(fd: FormData) {
  return Object.fromEntries(FIELDS.map((k) => [k, fd.get(k) ?? ""]));
}

function prismaCode(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError ? e.code : null;
}

const DUPLICATE: FieldErrors = { name: "כבר קיים סוג בשם זה" };

export async function createCategory(
  domain: CatalogDomain,
  _prev: CategoryFormState,
  fd: FormData,
): Promise<CategoryFormState> {
  const { user, db } = await adminContext();
  if (!CATALOG_DOMAINS.includes(domain)) return { error: "תחום לא תקין" };
  const parsed = parseCategory(domain, read(fd));
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  try {
    await db.$transaction(async (tx) => {
      const category = await tx.equipmentCategory.create({ data: { ...parsed.data, domain, companyId: user.companyId } });
      // Storage is tracked one row per type (תקן / מצאי) — open the row right away.
      if (domain === "STORAGE") {
        await tx.storageItem.create({
          data: { companyId: user.companyId, categoryId: category.id, targetQuantity: 0, currentQuantity: 0 },
        });
      }
    });
  } catch (e) {
    if (prismaCode(e) === "P2002") return { errors: DUPLICATE };
    throw e;
  }
  updateTag(catalogTag(user.companyId));
  return { ok: true, message: `"${parsed.data.name}" נוסף לקטלוג`, at: Date.now() };
}

export async function updateCategory(id: string, _prev: CategoryFormState, fd: FormData): Promise<CategoryFormState> {
  const { user, db } = await adminContext();
  const existing = await db.equipmentCategory.findUnique({ where: { id }, select: { domain: true } });
  if (!existing) return { error: "הסוג לא נמצא" };
  const parsed = parseCategory(existing.domain, read(fd));
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  try {
    await db.equipmentCategory.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (prismaCode(e) === "P2002") return { errors: DUPLICATE };
    throw e;
  }
  updateTag(catalogTag(user.companyId));
  return { ok: true, message: "נשמר", at: Date.now() };
}

export type SimpleResult = { ok: boolean; message?: string };

export async function setCategoryActive(id: string, active: boolean): Promise<SimpleResult> {
  const { user, db } = await adminContext();
  await db.equipmentCategory.update({ where: { id }, data: { isActive: active } });
  updateTag(catalogTag(user.companyId));
  return { ok: true };
}

/** Hard delete — only for unused types. Used types should be deactivated instead. */
export async function deleteCategory(id: string): Promise<SimpleResult> {
  const { user, db } = await adminContext();
  const c = await db.equipmentCategory.findUnique({
    where: { id },
    select: { domain: true, _count: { select: { equipmentItems: true, ammoStocks: true } }, storageItems: { select: { id: true, currentQuantity: true, targetQuantity: true } } },
  });
  if (!c) return { ok: false, message: "הסוג לא נמצא" };
  // An empty auto-created storage row doesn't count as usage.
  const storageInUse = c.storageItems.some((s) => s.currentQuantity > 0 || s.targetQuantity > 0);
  if (c._count.equipmentItems || c._count.ammoStocks || storageInUse) {
    return { ok: false, message: "הסוג בשימוש ולכן לא ניתן למחוק אותו. ניתן להשבית אותו במקום." };
  }
  try {
    await db.$transaction([
      db.storageItem.deleteMany({ where: { categoryId: id } }),
      db.equipmentCategory.delete({ where: { id } }),
    ]);
  } catch (e) {
    if (prismaCode(e) === "P2003") return { ok: false, message: "הסוג בשימוש ולכן לא ניתן למחוק אותו." };
    throw e;
  }
  updateTag(catalogTag(user.companyId));
  return { ok: true };
}
