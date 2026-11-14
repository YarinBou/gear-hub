"use server";

import { refresh } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { AmmoLogType } from "@/generated/prisma/enums";
import { applyMovement } from "@/lib/ammo-rules";
import { companyContext, adminContext } from "@/lib/context";
import { formatNumber } from "@/lib/utils";
import { AddStockSchema, MovementSchema } from "@/lib/validation/ammo";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

export type AmmoFormState =
  | { ok?: boolean; message?: string; error?: string; errors?: FieldErrors; at?: number }
  | undefined;

class MovementError extends Error {}

/** Open a new (type, location) stock row with an initial count. */
export async function addStock(_prev: AmmoFormState, fd: FormData): Promise<AmmoFormState> {
  const { user, db } = await companyContext();
  const parsed = AddStockSchema.safeParse({
    categoryId: fd.get("categoryId") ?? "",
    location: fd.get("location") ?? "",
    quantity: fd.get("quantity") ?? "",
    note: fd.get("note") ?? "",
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const { categoryId, location, quantity, note } = parsed.data;

  const category = await db.equipmentCategory.findFirst({
    where: { id: categoryId, domain: "AMMUNITION", isActive: true },
    select: { name: true },
  });
  if (!category) return { errors: { categoryId: "סוג תחמושת לא תקין" } };

  try {
    await db.$transaction(async (tx) => {
      const stock = await tx.ammoStock.create({
        data: { companyId: user.companyId, categoryId, location, quantity, lastCountedAt: new Date() },
      });
      await tx.ammoLog.create({
        data: {
          companyId: user.companyId,
          stockId: stock.id,
          type: "COUNT",
          amount: quantity,
          previousQuantity: 0,
          newQuantity: quantity,
          note: note ?? "פתיחת מיקום",
          performedById: user.id,
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { errors: { location: `כבר קיים מיקום "${location}" עבור ${category.name}` } };
    }
    throw e;
  }
  refresh();
  return { ok: true, message: `נפתח מיקום "${location}" עבור ${category.name}`, at: Date.now() };
}

/** Count / receive / issue at one location. Row-locked so concurrent updates can't lose a movement. */
export async function recordMovement(stockId: string, _prev: AmmoFormState, fd: FormData): Promise<AmmoFormState> {
  const { user, db } = await companyContext();
  const parsed = MovementSchema.safeParse({
    type: fd.get("type") ?? "",
    amount: fd.get("amount") ?? "",
    note: fd.get("note") ?? "",
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const type = parsed.data.type as AmmoLogType;
  const amount = parsed.data.amount!;

  let result: { previous: number; next: number };
  try {
    result = await db.$transaction(async (tx) => {
      // Lock the row for the duration of the transaction. Raw SQL isn't scoped by scopedDb,
      // so the company condition is written out here.
      const rows = await tx.$queryRaw<{ quantity: number }[]>`
        SELECT quantity FROM "AmmoStock" WHERE id = ${stockId} AND "companyId" = ${user.companyId} FOR UPDATE`;
      if (!rows.length) throw new MovementError("המיקום לא נמצא");
      const previous = rows[0].quantity;
      const moved = applyMovement(previous, type, amount);
      if ("error" in moved) throw new MovementError(moved.error);

      await tx.ammoStock.update({
        where: { id: stockId },
        data: { quantity: moved.quantity, ...(type === "COUNT" ? { lastCountedAt: new Date() } : {}) },
      });
      await tx.ammoLog.create({
        data: {
          companyId: user.companyId,
          stockId,
          type,
          amount,
          previousQuantity: previous,
          newQuantity: moved.quantity,
          note: parsed.data.note,
          performedById: user.id,
        },
      });
      return { previous, next: moved.quantity };
    });
  } catch (e) {
    if (e instanceof MovementError) return { error: e.message };
    throw e;
  }

  refresh();
  const diff = result.next - result.previous;
  const verb = type === "COUNT" ? "ספירה נשמרה" : type === "RECEIVE" ? "קליטה נרשמה" : "ניפוק נרשם";
  const delta = type === "COUNT" && diff !== 0 ? ` (פער של ${diff > 0 ? "+" : "−"}${formatNumber(Math.abs(diff))})` : "";
  return {
    ok: true,
    message: `${verb}: ${formatNumber(result.previous)} ← ${formatNumber(result.next)}${delta}`,
    at: Date.now(),
  };
}

/** Remove an empty location. Admin only — it also removes that location's log. */
export async function deleteStock(stockId: string): Promise<{ ok: boolean; message?: string }> {
  const { db } = await adminContext();
  const { count } = await db.ammoStock.deleteMany({ where: { id: stockId, quantity: 0 } });
  if (!count) return { ok: false, message: "ניתן להסיר רק מיקום ריק (כמות 0)" };
  refresh();
  return { ok: true };
}
