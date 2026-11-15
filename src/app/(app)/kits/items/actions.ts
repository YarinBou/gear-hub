"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { adminContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { createKitStatuses } from "@/lib/kit-service";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

// Admin: the company's personal-kit checklist (תכולת ערכה). Company-level — changes apply to the
// active deployment's kits right away; closed deployments keep what was recorded then.

export type KitItemFormState = { ok?: boolean; message?: string; error?: string; errors?: FieldErrors; at?: number } | undefined;
export type SimpleResult = { ok: boolean; message?: string };

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const ItemSchema = z.object({
  label: z.string().trim().min(1, "יש להזין שם פריט").max(60, "השם ארוך מדי"),
  groupName: z.string().trim().min(1, "יש לבחור או להזין קבוצה").max(40, "שם הקבוצה ארוך מדי"),
  targetQuantity: z.preprocess(
    emptyToUndef,
    z.coerce.number({ error: "יש להזין מספר" }).int("מספר שלם").min(1, "לפחות 1").max(1000, "לכל היותר 1,000").optional(),
  ),
});

function read(fd: FormData) {
  return { label: fd.get("label") ?? "", groupName: fd.get("groupName") ?? "", targetQuantity: fd.get("targetQuantity") ?? "" };
}

/** Kits of the company's active deployment (if any). */
async function activeKitIds(companyId: string) {
  const kits = await scopedDb(companyId).personalKit.findMany({
    where: { deployment: { status: "ACTIVE" } },
    select: { id: true },
  });
  return kits.map((k) => k.id);
}

export async function createKitItem(_prev: KitItemFormState, fd: FormData): Promise<KitItemFormState> {
  const { user, db } = await adminContext();
  const parsed = ItemSchema.safeParse(read(fd));
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const { label, groupName, targetQuantity } = parsed.data;

  const last = await db.kitItemDef.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await scopedDb(user.companyId).$transaction(async (tx) => {
    await tx.kitItemDef.create({
      data: { companyId: user.companyId, label, groupName, targetQuantity: targetQuantity ?? null, sortOrder: (last?.sortOrder ?? 0) + 10 },
    });
    // Every kit of the active deployment gets the new line (per the "new kits start" setting).
    await createKitStatuses(tx, { companyId: user.companyId, kitIds: await activeKitIds(user.companyId) });
  });
  refresh();
  return { ok: true, message: `"${label}" נוסף לרשימה`, at: Date.now() };
}

export async function updateKitItem(id: string, _prev: KitItemFormState, fd: FormData): Promise<KitItemFormState> {
  const { user, db } = await adminContext();
  const parsed = ItemSchema.safeParse(read(fd));
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const existing = await db.kitItemDef.findUnique({ where: { id }, select: { targetQuantity: true } });
  if (!existing) return { error: "הפריט לא נמצא" };
  const target = parsed.data.targetQuantity ?? null;

  await scopedDb(user.companyId).$transaction(async (tx) => {
    await tx.kitItemDef.update({ where: { id }, data: { ...parsed.data, targetQuantity: target } });
    // Switching between "present / missing" and "counted": convert the active deployment's lines.
    const live = { itemId: id, kit: { deployment: { status: "ACTIVE" as const } } };
    if (existing.targetQuantity == null && target != null) {
      await tx.kitItemStatus.updateMany({ where: { ...live, present: true }, data: { quantity: target } });
      await tx.kitItemStatus.updateMany({ where: { ...live, present: false }, data: { quantity: 0 } });
    } else if (existing.targetQuantity != null && target == null) {
      await tx.kitItemStatus.updateMany({ where: { ...live, quantity: { gte: existing.targetQuantity } }, data: { present: true } });
      await tx.kitItemStatus.updateMany({ where: { ...live, OR: [{ quantity: null }, { quantity: { lt: existing.targetQuantity } }] }, data: { present: false } });
    }
  });
  refresh();
  return { ok: true, message: "נשמר", at: Date.now() };
}

/** Move one item up or down the list (swaps with its neighbour among active items). */
export async function moveKitItem(id: string, direction: "up" | "down"): Promise<SimpleResult> {
  const { db } = await adminContext();
  const items = await db.kitItemDef.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
  const i = items.findIndex((x) => x.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= items.length) return { ok: false };
  const [a, b] = [items[i], items[j]];
  // Equal sort orders can't be swapped meaningfully — renumber first.
  if (a.sortOrder === b.sortOrder) {
    await db.$transaction(items.map((x, k) => db.kitItemDef.update({ where: { id: x.id }, data: { sortOrder: (k + 1) * 10 } })));
    return moveKitItem(id, direction);
  }
  await db.$transaction([
    db.kitItemDef.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    db.kitItemDef.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);
  refresh();
  return { ok: true };
}

/** Items are never deleted (history refers to them) — they're switched off and on. */
export async function setKitItemActive(id: string, active: boolean): Promise<SimpleResult> {
  const { user } = await adminContext();
  await scopedDb(user.companyId).$transaction(async (tx) => {
    await tx.kitItemDef.update({ where: { id }, data: { isActive: active } });
    if (active) await createKitStatuses(tx, { companyId: user.companyId, kitIds: await activeKitIds(user.companyId) });
  });
  refresh();
  return { ok: true };
}

/** How new kits start: every item present, or every item missing. */
export async function setKitDefaultPresent(present: boolean): Promise<SimpleResult> {
  const { user } = await adminContext();
  if (typeof present !== "boolean") return { ok: false };
  await scopedDb(user.companyId).company.update({ where: { id: user.companyId }, data: { kitDefaultPresent: present } });
  refresh();
  return { ok: true };
}
