"use server";

import { refresh } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { AmmoLogType } from "@/generated/prisma/enums";
import { applyMovement, VERIFY_NOTE } from "@/lib/ammo-rules";
import { writableContext } from "@/lib/context";
import { formatNumber } from "@/lib/utils";
import { AddStockSchema, MovementSchema, TransferSchema } from "@/lib/validation/ammo";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

export type AmmoFormState =
  | { ok?: boolean; message?: string; error?: string; errors?: FieldErrors; at?: number }
  | undefined;

class MovementError extends Error {}
class FieldError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

type Db = Extract<Awaited<ReturnType<typeof writableContext>>, { ok: true }>["db"];

/** A soldier's ammo row is named after them; with the personal number if another soldier shares the name. */
async function soldierLocation(db: Db | Prisma.TransactionClient, soldier: { id: string; name: string; personalNumber: string | null }) {
  const namesake = await db.soldier.count({ where: { name: soldier.name, id: { not: soldier.id } } });
  return namesake && soldier.personalNumber ? `${soldier.name} (${soldier.personalNumber})` : soldier.name;
}

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
    location = await soldierLocation(db, soldier);
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

export type VerifyResult = { ok: boolean; message: string };

/**
 * אימות: confirm that the quantity shown is what is there, without typing it again. Each row gets a
 * count (ספירה) of its current quantity. Used for one row or a whole location at once.
 * `rows` carries the quantity the user saw: a row that changed since is skipped, not confirmed.
 */
export async function verifyStocks(rows: { id: string; quantity: number }[]): Promise<VerifyResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  const seen = new Map<string, number>();
  if (Array.isArray(rows)) {
    for (const r of rows.slice(0, 500)) {
      if (r && typeof r.id === "string" && Number.isInteger(r.quantity)) seen.set(r.id, r.quantity);
    }
  }
  if (!seen.size) return { ok: false, message: "לא נבחרו שורות לאימות" };

  const { verified, changed } = await db.$transaction(async (tx) => {
    // Lock the rows (raw SQL isn't scoped by scopedDb — company and deployment written out).
    const locked = await tx.$queryRaw<{ id: string; quantity: number }[]>`
      SELECT id, quantity FROM "AmmoStock"
      WHERE id = ANY(${[...seen.keys()]}) AND "companyId" = ${user.companyId} AND "deploymentId" = ${deployment.id}
      FOR UPDATE`;
    const same = locked.filter((r) => r.quantity === seen.get(r.id));
    if (same.length) {
      const now = new Date();
      await tx.ammoStock.updateMany({ where: { id: { in: same.map((r) => r.id) } }, data: { lastCountedAt: now } });
      await tx.ammoLog.createMany({
        data: same.map((r) => ({
          companyId: user.companyId,
          stockId: r.id,
          type: "COUNT" as const,
          amount: r.quantity,
          previousQuantity: r.quantity,
          newQuantity: r.quantity,
          note: VERIFY_NOTE,
          performedById: user.id,
          createdAt: now,
        })),
      });
    }
    return { verified: same.length, changed: locked.length - same.length };
  });

  refresh();
  if (!verified) {
    return { ok: false, message: changed ? "הכמות השתנתה מאז שהדף נטען — יש לרענן ולבדוק שוב" : "השורות לא נמצאו" };
  }
  const parts = [verified === 1 ? "הכמות אומתה" : `${verified} שורות אומתו`];
  if (changed) parts.push(`${changed} דולגו (הכמות השתנתה בינתיים — יש לרענן)`);
  return { ok: true, message: parts.join(" · ") };
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

/**
 * העברה: move ammo from one location (or soldier) to another of the same type — e.g. what was
 * taken from a soldier or from חווה 5 goes to the בונקר. The destination is an existing row, a
 * place (opened if new) or a soldier. Both sides are logged (ניפוק / קליטה with "העברה" notes),
 * so the company total doesn't change.
 */
export async function transferAmmo(stockId: string, _prev: AmmoFormState, fd: FormData): Promise<AmmoFormState> {
  const w = await writableContext();
  if (!w.ok) return { error: w.message };
  const { user, db, deployment } = w;
  const parsed = TransferSchema.safeParse({
    to: fd.get("to") ?? "",
    location: fd.get("location") ?? "",
    soldierId: fd.get("soldierId") ?? "",
    amount: fd.get("amount") ?? "",
    note: fd.get("note") ?? "",
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const { to, amount, note } = parsed.data;
  const ctx = { companyId: user.companyId, deploymentId: deployment.id };

  let result: { from: string; to: string; left: number };
  try {
    result = await db.$transaction(async (tx) => {
      const source = await tx.ammoStock.findFirst({ where: { id: stockId }, select: { id: true, categoryId: true, location: true } });
      if (!source) throw new MovementError("המיקום לא נמצא");

      // Resolve (or open) the destination row of the same type.
      let destId: string | null = null;
      let destName = "";
      if (to.startsWith("stock:")) {
        const dest = await tx.ammoStock.findFirst({
          where: { id: to.slice(6), categoryId: source.categoryId },
          select: { id: true, location: true },
        });
        if (!dest) throw new MovementError("מיקום היעד לא נמצא");
        destId = dest.id;
        destName = dest.location;
      } else if (to === "soldier") {
        const soldier = await tx.soldier.findFirst({
          where: { id: parsed.data.soldierId, isActive: true, absences: { none: { deploymentId: deployment.id } } },
          select: { id: true, name: true, personalNumber: true },
        });
        if (!soldier) throw new FieldError("soldierId", "חייל לא תקין");
        const existing = await tx.ammoStock.findFirst({
          where: { categoryId: source.categoryId, soldierId: soldier.id },
          select: { id: true, location: true },
        });
        destName = existing?.location ?? (await soldierLocation(tx, soldier));
        destId = existing?.id ?? null;
        if (!destId) {
          const taken = await tx.ammoStock.findFirst({ where: { categoryId: source.categoryId, location: destName }, select: { id: true } });
          if (taken) throw new FieldError("soldierId", `כבר קיים מיקום בשם "${destName}"`);
          destId = (await tx.ammoStock.create({ data: { ...ctx, categoryId: source.categoryId, location: destName, soldierId: soldier.id } })).id;
        }
      } else {
        destName = parsed.data.location!;
        const existing = await tx.ammoStock.findFirst({
          where: { categoryId: source.categoryId, location: destName },
          select: { id: true, soldierId: true },
        });
        if (existing?.soldierId) throw new FieldError("location", `"${destName}" הוא חייל — יש לבחור אותו ברשימה`);
        destId = existing?.id ?? (await tx.ammoStock.create({ data: { ...ctx, categoryId: source.categoryId, location: destName } })).id;
      }
      if (destId === source.id) throw new MovementError("יש לבחור יעד אחר מהמקור");

      // Lock both rows, in a fixed order (no deadlock between opposite transfers).
      const locked = await tx.$queryRaw<{ id: string; quantity: number }[]>`
        SELECT id, quantity FROM "AmmoStock"
        WHERE id = ANY(${[source.id, destId]}) AND "companyId" = ${user.companyId} AND "deploymentId" = ${deployment.id}
        ORDER BY id FOR UPDATE`;
      const from = locked.find((r) => r.id === source.id);
      const dest = locked.find((r) => r.id === destId);
      if (!from || !dest) throw new MovementError("המיקום לא נמצא");
      if (amount > from.quantity) throw new FieldError("amount", `לא ניתן להעביר ${formatNumber(amount)} — ב${source.location} יש ${formatNumber(from.quantity)} בלבד`);

      const suffix = note ? ` — ${note}` : "";
      await tx.ammoStock.update({ where: { id: source.id }, data: { quantity: from.quantity - amount } });
      await tx.ammoLog.create({
        data: {
          companyId: user.companyId,
          stockId: source.id,
          type: "ISSUE",
          amount,
          previousQuantity: from.quantity,
          newQuantity: from.quantity - amount,
          note: `העברה ל${destName}${suffix}`.slice(0, 300),
          performedById: user.id,
        },
      });
      await tx.ammoStock.update({ where: { id: dest.id }, data: { quantity: dest.quantity + amount } });
      await tx.ammoLog.create({
        data: {
          companyId: user.companyId,
          stockId: dest.id,
          type: "RECEIVE",
          amount,
          previousQuantity: dest.quantity,
          newQuantity: dest.quantity + amount,
          note: `העברה מ${source.location}${suffix}`.slice(0, 300),
          performedById: user.id,
        },
      });
      return { from: source.location, to: destName, left: from.quantity - amount };
    });
  } catch (e) {
    if (e instanceof FieldError) return { errors: { [e.field]: e.message } };
    if (e instanceof MovementError) return { error: e.message };
    throw e;
  }

  refresh();
  return {
    ok: true,
    message: `הועברו ${formatNumber(amount)} מ${result.from} ל${result.to}${result.left ? ` · נשארו ${formatNumber(result.left)}` : ""}`,
    at: Date.now(),
  };
}
