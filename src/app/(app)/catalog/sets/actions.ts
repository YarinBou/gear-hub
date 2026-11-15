"use server";

import { refresh } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { adminContext } from "@/lib/context";
import { SetSchema, type SetInput } from "@/lib/equipment-sets";

// Admin: equipment sets (מארזים). Company-level. Changing a set changes what every item of that set
// is checked against; links already made (which item is a component of which) are not touched.

export type SetResult = { ok: boolean; message?: string; errors?: Record<string, string> };
export type SimpleResult = { ok: boolean; message?: string };

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Create (id = null) or replace a set and its lines. */
export async function saveSet(id: string | null, input: SetInput): Promise<SetResult> {
  const { user, db } = await adminContext();
  const parsed = SetSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const { name, mainCategoryId, notes, slots } = parsed.data;

  // Every type must be one of this company's equipment types.
  const typeIds = [...new Set([mainCategoryId, ...slots.map((s) => s.categoryId)])];
  const found = await db.equipmentCategory.count({ where: { id: { in: typeIds }, domain: "EQUIPMENT" } });
  if (found !== typeIds.length) return { ok: false, message: "אחד הסוגים לא נמצא בקטלוג" };

  const lines = slots.map((s, i) => ({ companyId: user.companyId, categoryId: s.categoryId, quantity: s.quantity, required: s.required, sortOrder: (i + 1) * 10 }));
  try {
    await db.$transaction(async (tx) => {
      if (id) {
        const existing = await tx.equipmentSet.findUnique({ where: { id }, select: { id: true } });
        if (!existing) throw new Error("not found");
        await tx.equipmentSet.update({ where: { id }, data: { name, mainCategoryId, notes: notes ?? null } });
        await tx.equipmentSetSlot.deleteMany({ where: { setId: id } });
        await tx.equipmentSetSlot.createMany({ data: lines.map((l) => ({ ...l, setId: id })) });
        // Items of this set whose type no longer matches the main type stop being "of this set".
        await tx.equipmentItem.updateMany({ where: { setId: id, categoryId: { not: mainCategoryId } }, data: { setId: null } });
      } else {
        const set = await tx.equipmentSet.create({ data: { companyId: user.companyId, name, mainCategoryId, notes: notes ?? null } });
        await tx.equipmentSetSlot.createMany({ data: lines.map((l) => ({ ...l, setId: set.id })) });
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, errors: { name: "כבר קיים מארז בשם זה" } };
    if (e instanceof Error && e.message === "not found") return { ok: false, message: "המארז לא נמצא" };
    throw e;
  }
  refresh();
  return { ok: true, message: id ? "המארז נשמר" : `המארז "${name}" נוסף` };
}

export async function setSetActive(id: string, active: boolean): Promise<SimpleResult> {
  const { db } = await adminContext();
  if (typeof active !== "boolean") return { ok: false };
  await db.equipmentSet.update({ where: { id }, data: { isActive: active } });
  refresh();
  return { ok: true };
}

/** Only for sets no item uses — otherwise deactivate. */
export async function deleteSet(id: string): Promise<SimpleResult> {
  const { db } = await adminContext();
  const set = await db.equipmentSet.findUnique({ where: { id }, select: { _count: { select: { items: true } } } });
  if (!set) return { ok: false, message: "המארז לא נמצא" };
  if (set._count.items) return { ok: false, message: "יש פריטים שהוחתמו במארז הזה — ניתן להשבית אותו במקום למחוק." };
  await db.equipmentSet.delete({ where: { id } });
  refresh();
  return { ok: true };
}
