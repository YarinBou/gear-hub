"use server";

import { updateTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { CatalogDomain } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CATALOG_DOMAINS, CATALOG_TAG } from "@/lib/queries/catalog";
import { parseCategory } from "@/lib/validation/catalog";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

export type CategoryFormState =
  | { ok?: boolean; message?: string; error?: string; errors?: FieldErrors; at?: number }
  | undefined;

const FIELDS = ["name", "description", "ammoCategory", "minThreshold", "requiresExpiry"];

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
  await requireAdmin();
  if (!CATALOG_DOMAINS.includes(domain)) return { error: "תחום לא תקין" };
  const parsed = parseCategory(domain, read(fd));
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  try {
    await prisma.$transaction(async (tx) => {
      const category = await tx.equipmentCategory.create({ data: { ...parsed.data, domain } });
      // Storage is tracked one row per type (תקן / מצאי) — open the row right away.
      if (domain === "STORAGE") {
        await tx.storageItem.create({ data: { categoryId: category.id, targetQuantity: 0, currentQuantity: 0 } });
      }
    });
  } catch (e) {
    if (prismaCode(e) === "P2002") return { errors: DUPLICATE };
    throw e;
  }
  updateTag(CATALOG_TAG);
  return { ok: true, message: `"${parsed.data.name}" נוסף לקטלוג`, at: Date.now() };
}

export async function updateCategory(id: string, _prev: CategoryFormState, fd: FormData): Promise<CategoryFormState> {
  await requireAdmin();
  const existing = await prisma.equipmentCategory.findUnique({ where: { id }, select: { domain: true } });
  if (!existing) return { error: "הסוג לא נמצא" };
  const parsed = parseCategory(existing.domain, read(fd));
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };

  try {
    await prisma.equipmentCategory.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (prismaCode(e) === "P2002") return { errors: DUPLICATE };
    throw e;
  }
  updateTag(CATALOG_TAG);
  return { ok: true, message: "נשמר", at: Date.now() };
}

export type SimpleResult = { ok: boolean; message?: string };

export async function setCategoryActive(id: string, active: boolean): Promise<SimpleResult> {
  await requireAdmin();
  await prisma.equipmentCategory.update({ where: { id }, data: { isActive: active } });
  updateTag(CATALOG_TAG);
  return { ok: true };
}

/** Hard delete — only for unused types. Used types should be deactivated instead. */
export async function deleteCategory(id: string): Promise<SimpleResult> {
  await requireAdmin();
  const c = await prisma.equipmentCategory.findUnique({
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
    await prisma.$transaction([
      prisma.storageItem.deleteMany({ where: { categoryId: id } }),
      prisma.equipmentCategory.delete({ where: { id } }),
    ]);
  } catch (e) {
    if (prismaCode(e) === "P2003") return { ok: false, message: "הסוג בשימוש ולכן לא ניתן למחוק אותו." };
    throw e;
  }
  updateTag(CATALOG_TAG);
  return { ok: true };
}
