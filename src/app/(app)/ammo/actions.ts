"use server";

import { refresh } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { AmmoLogType } from "@/generated/prisma/enums";
import { applyMovement } from "@/lib/ammo-rules";
import { writableContext } from "@/lib/context";
import { formatNumber } from "@/lib/utils";
import { AddStockSchema, MovementSchema } from "@/lib/validation/ammo";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

export type AmmoFormState =
  | { ok?: boolean; message?: string; error?: string; errors?: FieldErrors; at?: number }
  | undefined;

class MovementError extends Error {}

/** Open a new (type, location) stock row with an initial count. */
export async function addStock(_prev: AmmoFormState, fd: FormData): Promise<AmmoFormState> {
  const w = await writableContext();
  if (!w.ok) return { error: w.message };
  const { user, db, deployment } = w;
  const parsed = AddStockSchema.safeParse({
    holder: fd.get("holder") === "soldier" ? "soldier" : "place",
    categoryId: fd.get("categoryId") ?? "",
    location: fd.get("location") ?? "",
    soldierId: fd.get("soldierId") ?? "",
    quantity: fd.get("quantity") ?? "",
    note: fd.get("note") ?? "",
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const { categoryId, quantity, note } = parsed.data;

  const category = await db.equipmentCategory.findFirst({
    where: { id: categoryId, domain: "AMMUNITION", isActive: true },
    select: { name: true },
  });
  if (!category) return { errors: { categoryId: "סוג תחמושת לא תקין" } };

  let location: string;
  let soldierId: string | null = null;
  if (parsed.data.holder === "soldier") {
    // Must be an active soldier who is part of this deployment.
    const soldier = await db.soldier.findFirst({
      where: { id: parsed.data.soldierId, isActive: true, absences: { none: { deploymentId: deployment.id } } },
      select: { id: true, name: true, personalNumber: true },
    });
    if (!soldier) return { errors: { soldierId: "חייל לא תקין" } };
    soldierId = soldier.id;
    // The soldier's name is the row's location; add the personal number if another soldier shares the name.
    const namesake = await db.soldier.count({ where: { name: soldier.name, id: { not: soldier.id } } });
    location = namesake && soldier.personalNumber ? `${soldier.name} (${soldier.personalNumber})` : soldier.name;
  } else {
    location = parsed.data.location;
  }

  try {
    await db.$transaction(async (tx) => {
      const stock = await tx.ammoStock.create({
        data: { companyId: user.companyId, deploymentId: deployment.id, categoryId, location, soldierId, quantity, lastCountedAt: new Date() },
      });
      await tx.ammoLog.create({
        data: {
          companyId: user.companyId,
          stockId: stock.id,
          type: "COUNT",
          amount: quantity,
          previousQuantity: 0,
          newQuantity: quantity,
          note: note ?? (soldierId ? "מסירה לחייל" : "פתיחת מיקום"),
          performedById: user.id,
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const field = soldierId ? "soldierId" : "location";
      return { errors: { [field]: `כבר קיים מיקום "${location}" עבור ${category.name}` } };
    }
    throw e;
  }
  refresh();
  const what = soldierId ? `נרשם ${category.name} אצל ${location}` : `נפתח מיקום "${location}" עבור ${category.name}`;
  return { ok: true, message: what, at: Date.now() };
}

/** Count / receive / issue at one location. Row-locked so concurrent updates can't lose a movement. */
export async function recordMovement(stockId: string, _prev: AmmoFormState, fd: FormData): Promise<AmmoFormState> {
  const w = await writableContext();
  if (!w.ok) return { error: w.message };
  const { user, db, deployment } = w;
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
      // so the company and deployment conditions are written out here.
      const rows = await tx.$queryRaw<{ quantity: number }[]>`
        SELECT quantity FROM "AmmoStock"
        WHERE id = ${stockId} AND "companyId" = ${user.companyId} AND "deploymentId" = ${deployment.id}
        FOR UPDATE`;
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
  const w = await writableContext({ admin: true });
  if (!w.ok) return { ok: false, message: w.message };
  const { db } = w;
  const { count } = await db.ammoStock.deleteMany({ where: { id: stockId, quantity: 0 } });
  if (!count) return { ok: false, message: "ניתן להסיר רק מיקום ריק (כמות 0)" };
  refresh();
  return { ok: true };
}
