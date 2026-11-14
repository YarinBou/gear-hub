"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

export type StorageFormState = { ok?: boolean; message?: string; error?: string; errors?: FieldErrors; at?: number } | undefined;

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const qty = (label: string) =>
  z.preprocess(
    (v) => (v === "" ? 0 : v),
    z.coerce
      .number({ error: `${label}: יש להזין מספר` })
      .int("יש להזין מספר שלם")
      .min(0, "לא ניתן להזין כמות שלילית")
      .max(100_000, "הכמות גדולה מדי"),
  );

const StorageSchema = z.object({
  targetQuantity: qty("תקן"),
  currentQuantity: qty("מצאי"),
  expiryDate: z.preprocess(
    emptyToUndef,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין")
      .transform((s) => new Date(`${s}T00:00:00Z`))
      .refine((d) => !Number.isNaN(d.getTime()), "תאריך לא תקין")
      .optional(),
  ),
  location: z.preprocess(emptyToUndef, z.string().trim().max(40, "שם המיקום ארוך מדי").optional()),
  notes: z.preprocess(emptyToUndef, z.string().trim().max(300, "ההערה ארוכה מדי").optional()),
  damaged: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

/** Create or update the storage line of one type. */
export async function saveStorageLine(categoryId: string, _prev: StorageFormState, fd: FormData): Promise<StorageFormState> {
  await requireUser();
  const parsed = StorageSchema.safeParse(
    Object.fromEntries(
      ["targetQuantity", "currentQuantity", "expiryDate", "location", "notes", "damaged"].map((k) => [k, fd.get(k) ?? ""]),
    ),
  );
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const d = parsed.data;

  const category = await prisma.equipmentCategory.findFirst({
    where: { id: categoryId, domain: "STORAGE" },
    select: { name: true, requiresExpiry: true, storageItems: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true } } },
  });
  if (!category) return { error: "הסוג לא נמצא" };
  if (category.requiresExpiry && d.currentQuantity > 0 && !d.expiryDate) {
    return { errors: { expiryDate: "פריט זה דורש תאריך תפוגה (התאריך הקרוב ביותר במלאי)" } };
  }

  const data = {
    targetQuantity: d.targetQuantity,
    currentQuantity: d.currentQuantity,
    // Only types that track expiry keep a date.
    expiryDate: category.requiresExpiry ? (d.expiryDate ?? null) : null,
    location: d.location ?? null,
    notes: d.notes ?? null,
    // Stored status is only the manual flag; shortage / expiry are derived when read.
    status: d.damaged ? ("DAMAGED" as const) : ("OK" as const),
  };
  const existing = category.storageItems[0];
  if (existing) await prisma.storageItem.update({ where: { id: existing.id }, data });
  else await prisma.storageItem.create({ data: { ...data, categoryId } });

  refresh();
  return { ok: true, message: `${category.name} עודכן`, at: Date.now() };
}
