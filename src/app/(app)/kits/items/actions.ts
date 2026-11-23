"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { adminContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { applyStartToUnissuedKits, createKitStatuses } from "@/lib/kit-service";
import { MAX_KIT_COUNT } from "@/lib/constants";
import { nextColor } from "@/lib/platoons";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

// Admin: the company's personal-kit checklist (תכולת ערכה). Company-level — changes apply to the
// active deployment's kits right away; closed deployments keep what was recorded then.
// Each item has a start state (present / missing): new kits start that way, and kits not issued
// yet follow it when it changes (issued kits keep what was marked on them).

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

/** Readable "N ערכות" for result messages. */
function kitsText(n: number) {
  return n === 1 ? "ערכה אחת" : `${n} ערכות`;
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

  const startPresent = fd.get("startPresent") === "on";
  const optional = fd.get("optional") === "on";

  const last = await db.kitItemDef.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await scopedDb(user.companyId).$transaction(async (tx) => {
    await tx.kitItemDef.create({
      data: {
        companyId: user.companyId,
        label,
        groupName,
        targetQuantity: targetQuantity ?? null,
        startPresent,
        optional,
        sortOrder: (last?.sortOrder ?? 0) + 10,
      },
    });
    // Every kit of the active deployment gets the new line, in the item's start state.
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
      // Signed for the item → signed for the full quantity.
      await tx.kitItemStatus.updateMany({ where: { ...live, baseline: { gt: 0 } }, data: { baseline: target } });
    } else if (existing.targetQuantity != null && target == null) {
      await tx.kitItemStatus.updateMany({ where: { ...live, quantity: { gte: existing.targetQuantity } }, data: { present: true } });
      await tx.kitItemStatus.updateMany({ where: { ...live, OR: [{ quantity: null }, { quantity: { lt: existing.targetQuantity } }] }, data: { present: false } });
      await tx.kitItemStatus.updateMany({ where: { ...live, baseline: { gt: 0 } }, data: { baseline: 1 } });
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
    if (active) {
      await createKitStatuses(tx, { companyId: user.companyId, kitIds: await activeKitIds(user.companyId) });
      // Rows kept from before it was switched off: unissued kits start over per its start state.
      await applyStartToUnissuedKits(tx, [id]);
    }
  });
  refresh();
  return { ok: true };
}

/**
 * "הכל קיים" / "הכל חסר": every item's start state at once (and the one offered for items added
 * later). Unissued kits of the active deployment follow right away.
 */
export async function setKitDefaultPresent(present: boolean): Promise<SimpleResult> {
  const { user } = await adminContext();
  if (typeof present !== "boolean") return { ok: false };
  const changed = await scopedDb(user.companyId).$transaction(
    async (tx) => {
      await tx.company.update({ where: { id: user.companyId }, data: { kitDefaultPresent: present } });
      await tx.kitItemDef.updateMany({ data: { startPresent: present } });
      return applyStartToUnissuedKits(tx);
    },
    { timeout: 30_000 },
  );
  refresh();
  return { ok: true, message: changed ? `עודכנו ${kitsText(changed)} שטרם הונפקו` : "נשמר" };
}

/** One item's start state. Unissued kits of the active deployment follow right away. */
export async function setKitItemStartPresent(id: string, present: boolean): Promise<SimpleResult> {
  const { user } = await adminContext();
  if (typeof present !== "boolean") return { ok: false };
  const changed = await scopedDb(user.companyId).$transaction(
    async (tx) => {
      const { count } = await tx.kitItemDef.updateMany({ where: { id }, data: { startPresent: present } });
      if (!count) return null;
      return applyStartToUnissuedKits(tx, [id]);
    },
    { timeout: 30_000 },
  );
  if (changed == null) return { ok: false, message: "הפריט לא נמצא" };
  refresh();
  return { ok: true, message: changed ? `עודכנו ${kitsText(changed)} שטרם הונפקו` : "נשמר" };
}

/**
 * How many personal kits the company has. The active deployment follows right away: new kits are
 * added (with their checklist), and kits above the new count are removed — only if none of them is
 * issued (soldier, weapon or signature). Closed deployments keep the kits they had.
 */
export async function setKitCount(countRaw: number): Promise<SimpleResult> {
  const { user } = await adminContext();
  const count = Math.floor(Number(countRaw));
  if (!Number.isFinite(count) || count < 1 || count > MAX_KIT_COUNT) {
    return { ok: false, message: `מספר בין 1 ל-${MAX_KIT_COUNT}` };
  }
  const db = scopedDb(user.companyId);
  const active = await db.deployment.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });

  if (active) {
    const issued = await db.personalKit.findMany({
      where: {
        deploymentId: active.id,
        kitNumber: { gt: count },
        OR: [{ soldierId: { not: null } }, { personalWeaponId: { not: null } }, { signedAt: { not: null } }],
      },
      orderBy: { kitNumber: "asc" },
      select: { kitNumber: true },
    });
    if (issued.length) {
      const list = issued.slice(0, 10).map((k) => k.kitNumber).join(", ");
      return { ok: false, message: `ערכות מונפקות מעל ${count}: ${list}${issued.length > 10 ? "…" : ""}. יש לזכות אותן קודם.` };
    }
  }

  await db.$transaction(async (tx) => {
    await tx.company.update({ where: { id: user.companyId }, data: { kitCount: count } });
    if (!active) return;
    // Removing: checklist rows and inspections go with the kit (cascade).
    await tx.personalKit.deleteMany({ where: { deploymentId: active.id, kitNumber: { gt: count } } });
    // Adding: create the missing kits and their checklist.
    const existing = new Set(
      (await tx.personalKit.findMany({ where: { deploymentId: active.id }, select: { kitNumber: true } })).map((k) => k.kitNumber),
    );
    const missing = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !existing.has(n));
    if (missing.length) {
      const kits = await tx.personalKit.createManyAndReturn({
        data: missing.map((kitNumber) => ({ companyId: user.companyId, deploymentId: active.id, kitNumber })),
        select: { id: true },
      });
      await createKitStatuses(tx, { companyId: user.companyId, kitIds: kits.map((k) => k.id) });
    }
  }, { timeout: 30_000 });
  refresh();
  return { ok: true, message: `לפלוגה ${count} ערכות` };
}

/**
 * אופציונלי: the item is part of a kit only when the soldier signed for it or the kit's פק"ל
 * requires it (e.g. drums). Nothing is rewritten — only what counts as missing changes.
 */
export async function setKitItemOptional(id: string, optional: boolean): Promise<SimpleResult> {
  const { db } = await adminContext();
  if (typeof optional !== "boolean") return { ok: false };
  const { count } = await db.kitItemDef.updateMany({ where: { id, systemKey: null }, data: { optional } });
  if (!count) return { ok: false, message: "לא ניתן לשנות פריט זה" };
  refresh();
  return { ok: true };
}

// ───────────── פק"לים (role kits) ─────────────

const PakalName = z.string().trim().min(1, "יש להזין שם").max(30, "השם ארוך מדי");

export async function createPakal(_prev: KitItemFormState, fd: FormData): Promise<KitItemFormState> {
  const { user, db } = await adminContext();
  const name = PakalName.safeParse(fd.get("name") ?? "");
  if (!name.success) return { errors: { name: name.error.issues[0].message } };
  if (await db.pakal.findFirst({ where: { name: name.data }, select: { id: true } })) {
    return { errors: { name: `כבר קיים פק"ל בשם "${name.data}"` } };
  }
  const used = (await db.pakal.findMany({ select: { color: true } })).map((p) => p.color);
  await db.pakal.create({ data: { companyId: user.companyId, name: name.data, color: nextColor(used) } });
  refresh();
  return { ok: true, message: `נוסף פק"ל "${name.data}" — עכשיו בחרו את הפריטים שהוא מחייב`, at: Date.now() };
}

export async function renamePakal(id: string, raw: string): Promise<SimpleResult> {
  const { db } = await adminContext();
  const name = PakalName.safeParse(raw);
  if (!name.success) return { ok: false, message: name.error.issues[0].message };
  if (await db.pakal.findFirst({ where: { name: name.data, id: { not: id } }, select: { id: true } })) {
    return { ok: false, message: `כבר קיים פק"ל בשם "${name.data}"` };
  }
  const { count } = await db.pakal.updateMany({ where: { id }, data: { name: name.data } });
  if (!count) return { ok: false, message: 'הפק"ל לא נמצא' };
  refresh();
  return { ok: true };
}

/** Switched off, a פק"ל can't be given to more kits; kits already marked keep it (and its requirements). */
export async function setPakalActive(id: string, active: boolean): Promise<SimpleResult> {
  const { db } = await adminContext();
  if (typeof active !== "boolean") return { ok: false };
  await db.pakal.updateMany({ where: { id }, data: { isActive: active } });
  refresh();
  return { ok: true };
}

/** What a פק"ל requires: set an item's quantity (0 = not required). */
export async function setPakalItem(pakalId: string, itemId: string, quantity: number): Promise<SimpleResult> {
  const { user, db } = await adminContext();
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000) return { ok: false, message: "כמות לא תקינה" };
  const [pakal, item] = await Promise.all([
    db.pakal.findUnique({ where: { id: pakalId }, select: { id: true } }),
    db.kitItemDef.findFirst({ where: { id: itemId, isActive: true, systemKey: null }, select: { id: true, targetQuantity: true } }),
  ]);
  if (!pakal || !item) return { ok: false, message: "בחירה לא תקינה" };
  if (quantity === 0) {
    await db.pakalItem.deleteMany({ where: { pakalId, itemId } });
  } else {
    // A present / missing item is just required (1).
    const q = item.targetQuantity == null ? 1 : quantity;
    await db.pakalItem.upsert({
      where: { pakalId_itemId: { pakalId, itemId } },
      update: { quantity: q },
      create: { companyId: user.companyId, pakalId, itemId, quantity: q },
    });
  }
  refresh();
  return { ok: true };
}
