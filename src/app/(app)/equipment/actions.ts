"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { EquipmentStatus, Platoon } from "@/generated/prisma/enums";
import { adminContext, companyContext, readOnlyMessage, writableContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS, PLATOONS, PLATOON_LABELS } from "@/lib/constants";
import { resolveStatus } from "@/lib/equipment-rules";
import {
  AssignmentError,
  applyAssignment,
  attachComponent,
  detachComponent,
  type DeploymentCtx,
} from "@/lib/equipment-service";
import {
  AssignSchema,
  CreateEquipmentSchema,
  NoSerialQuantitySchema,
  SerialListSchema,
  toFieldErrors,
  UpdateDetailsSchema,
  type FieldErrors,
} from "@/lib/validation/equipment";

// Items are company-level (create / edit details / delete work with or without a deployment).
// Who holds them, their status and platoon belong to a deployment: those actions need the viewed
// deployment to be the active one (writableContext()).

export type FormState =
  | {
      ok?: boolean;
      message?: string;
      error?: string;
      errors?: FieldErrors;
      values?: Record<string, string>;
      /** Set on success; forms use it as a key to reset their fields. */
      at?: number;
    }
  | undefined;

function formValues(fd: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));
}

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// ───────────── Create (single, batch, or "ללא צ") ─────────────

export async function createEquipment(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user, db, deployment } = await companyContext();
  const values = formValues(fd, ["categoryId", "serials", "quantity", "noSerial", "status", "soldierId", "platoon", "notes"]);
  const parsed = CreateEquipmentSchema.safeParse(values);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values };
  const { categoryId, notes, noSerial } = parsed.data;

  // A holder / status / platoon is deployment state — only in the active deployment.
  const wantsState = !!(parsed.data.soldierId || parsed.data.status || parsed.data.platoon);
  if (wantsState && deployment?.readOnly) return { error: readOnlyMessage(deployment.name), values };
  if (wantsState && !deployment) {
    return { error: "אין הפעלה פעילה — ניתן לקלוט פריטים לנשקייה בלבד (בלי לוחם / סטטוס / מחלקה).", values };
  }

  // Either a list of serials, or a quantity of items whose serials aren't known yet.
  let serials: (string | null)[];
  if (noSerial) {
    const qty = NoSerialQuantitySchema.safeParse(values.quantity);
    if (!qty.success) return { errors: { quantity: qty.error.issues[0]?.message ?? "כמות לא תקינה" }, values };
    serials = Array.from({ length: qty.data }, () => null);
  } else {
    const list = SerialListSchema.safeParse(values.serials);
    if (!list.success) return { errors: { serials: list.error.issues[0]?.message ?? "רשימה לא תקינה" }, values };
    const dupInBatch = list.data.filter((s, i) => list.data.indexOf(s) !== i);
    if (dupInBatch.length) {
      return { errors: { serials: `מספרים כפולים ברשימה: ${[...new Set(dupInBatch)].join(", ")}` }, values };
    }
    const existing = await db.equipmentItem.findMany({
      where: { serialNumber: { in: list.data } },
      select: { serialNumber: true },
    });
    if (existing.length) {
      return { errors: { serials: `כבר קיימים במערכת: ${existing.map((e) => e.serialNumber).join(", ")}` }, values };
    }
    serials = list.data;
  }

  const category = await db.equipmentCategory.findFirst({
    where: { id: categoryId, domain: "EQUIPMENT", isActive: true },
    select: { id: true },
  });
  if (!category) return { errors: { categoryId: "סוג פריט לא תקין" }, values };

  let platoon = (parsed.data.platoon as Platoon | undefined) ?? null;
  if (parsed.data.soldierId) {
    const soldier = await db.soldier.findFirst({
      where: { id: parsed.data.soldierId, isActive: true },
      select: { platoon: true },
    });
    if (!soldier) return { errors: { soldierId: "הלוחם לא נמצא" }, values };
    platoon = soldier.platoon;
  }
  const resolved = resolveStatus({
    current: "IN_ARMORY",
    requested: parsed.data.status as EquipmentStatus | undefined,
    hasSoldier: !!parsed.data.soldierId,
  });
  if ("error" in resolved) return { errors: { status: resolved.error }, values };

  // Every item has a state row in the company's active deployment (if there is one) — even when
  // the user is looking at a past deployment while adding it.
  const companyDb = scopedDb(user.companyId);
  const active = await companyDb.deployment.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });

  let created: { id: string }[];
  try {
    created = await companyDb.$transaction(async (tx) => {
      const items = await tx.equipmentItem.createManyAndReturn({
        data: serials.map((serialNumber) => ({ companyId: user.companyId, serialNumber, categoryId, notes })),
        select: { id: true },
      });
      const soldierId = parsed.data.soldierId ?? null;
      if (active) {
        await tx.equipmentAssignment.createMany({
          data: items.map((i) => ({
            companyId: user.companyId,
            deploymentId: active.id,
            itemId: i.id,
            soldierId,
            status: resolved.status,
            platoon,
          })),
        });
      }
      await tx.equipmentLog.createMany({
        data: items.map((i) => ({
          companyId: user.companyId,
          deploymentId: active?.id ?? null,
          itemId: i.id,
          toSoldierId: soldierId,
          toStatus: resolved.status,
          platoon,
          note: noSerial ? "נקלט במערכת (ללא צ)" : "נקלט במערכת",
          performedById: user.id,
        })),
      });
      return items;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: { serials: "אחד המספרים כבר קיים במערכת" }, values };
    throw e;
  }

  redirect(created.length === 1 ? `/equipment/${created[0].id}` : `/equipment?category=${categoryId}`);
}

// ───────────── Item page ─────────────

export async function updateDetails(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { db } = await companyContext();
  const values = formValues(fd, ["categoryId", "serialNumber", "notes"]);
  const parsed = UpdateDetailsSchema.safeParse(values);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values };
  // Must be one of this company's equipment types (not an ammo/storage type, not another company's).
  const category = await db.equipmentCategory.findFirst({
    where: { id: parsed.data.categoryId, domain: "EQUIPMENT" },
    select: { id: true },
  });
  if (!category) return { errors: { categoryId: "סוג פריט לא תקין" }, values };
  try {
    await db.equipmentItem.update({
      where: { id },
      data: {
        categoryId: category.id,
        serialNumber: parsed.data.serialNumber ?? null,
        notes: parsed.data.notes ?? null,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: { serialNumber: 'מספר צ / מס"ט זה כבר קיים במערכת' }, values };
    throw e;
  }
  refresh();
  return { ok: true, message: "הפרטים נשמרו" };
}

function deploymentCtx(w: { user: { id: string; companyId: string }; deployment: { id: string } }): DeploymentCtx {
  return { companyId: w.user.companyId, deploymentId: w.deployment.id, userId: w.user.id };
}

export async function assignEquipment(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const w = await writableContext();
  const values = formValues(fd, ["soldierId", "status", "platoon", "note", "verify"]);
  if (!w.ok) return { error: w.message, values };
  const parsed = AssignSchema.safeParse(values);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values };
  const d = parsed.data;
  try {
    await w.db.$transaction((tx) =>
      applyAssignment(tx, deploymentCtx(w), id, {
        soldierId: d.soldierId ?? null,
        status: d.status as EquipmentStatus | undefined,
        platoon: (d.platoon as Platoon | undefined) ?? null,
        note: d.note,
        verify: d.verify,
      }),
    );
  } catch (e) {
    if (e instanceof AssignmentError) return { error: e.message, values };
    throw e;
  }
  refresh();
  return { ok: true, message: "השיוך עודכן", at: Date.now() };
}

/**
 * Admin only, for items entered by mistake. Refused once the item is part of a deployment's
 * record (a kit's personal weapon, or any history beyond its intake), so history stays intact.
 */
export async function deleteEquipment(id: string, _prev: FormState, _fd: FormData): Promise<FormState> {
  const { user } = await adminContext();
  const companyDb = scopedDb(user.companyId); // across all deployments
  const kit = await companyDb.personalKit.findFirst({
    where: { personalWeaponId: id },
    select: { kitNumber: true, deployment: { select: { name: true } } },
  });
  if (kit) {
    return { error: `הפריט רשום כנשק אישי בערכה ${kit.kitNumber} (${kit.deployment.name}). יש לנתק אותו מהערכה תחילה.` };
  }
  const moves = await companyDb.equipmentLog.count({ where: { itemId: id, fromStatus: { not: null } } });
  if (moves) return { error: "לפריט יש היסטוריית שיוכים בהפעלות, ולכן לא ניתן למחוק אותו." };
  // Components are detached automatically (parentId → null).
  await companyDb.equipmentItem.delete({ where: { id } });
  redirect("/equipment");
}

// ───────────── Linked sets ─────────────

export type SimpleResult = { ok: boolean; message?: string };

/** Linking is physical (company-level); in an active deployment the component also takes the parent's state. */
async function linkContext() {
  const { user, db, deployment } = await companyContext();
  if (deployment?.readOnly) return { error: readOnlyMessage(deployment.name) } as const;
  const ctx = deployment ? { companyId: user.companyId, deploymentId: deployment.id, userId: user.id } : null;
  return { db, ctx } as const;
}

export async function attachComponentAction(parentId: string, childId: string): Promise<SimpleResult> {
  if (typeof childId !== "string" || !childId) return { ok: false, message: "יש לבחור פריט" };
  const l = await linkContext();
  if ("error" in l) return { ok: false, message: l.error };
  try {
    await l.db.$transaction((tx) => attachComponent(tx, l.ctx, parentId, childId));
  } catch (e) {
    if (e instanceof AssignmentError) return { ok: false, message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "הרכיב צורף" };
}

export async function detachComponentAction(childId: string): Promise<SimpleResult> {
  const l = await linkContext();
  if ("error" in l) return { ok: false, message: l.error };
  try {
    await l.db.$transaction((tx) => detachComponent(tx, l.ctx, childId));
  } catch (e) {
    if (e instanceof AssignmentError) return { ok: false, message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "הרכיב נותק" };
}

// ───────────── Quick + bulk actions (list page) ─────────────

export type BulkResult = { ok: boolean; message: string };

const MAX_BULK = 500;

function cleanIds(ids: unknown): string[] {
  return Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string"))].slice(0, MAX_BULK) : [];
}

const rowSelect = {
  id: true,
  itemId: true,
  status: true,
  platoon: true,
  soldierId: true,
  soldier: { select: { platoon: true } },
  item: { select: { parentId: true } },
} as const;

/** State rows (in the deployment `db` is scoped to) of the given items. */
async function rowsOf(db: PrismaClient, itemIds: string[]) {
  return db.equipmentAssignment.findMany({ where: { itemId: { in: itemIds } }, select: rowSelect });
}

/** State rows of the components of the given parents (they always follow their parent). */
async function componentRowsOf(db: PrismaClient, parentItemIds: string[]) {
  if (!parentItemIds.length) return [];
  return db.equipmentAssignment.findMany({ where: { item: { parentId: { in: parentItemIds } } }, select: rowSelect });
}

const COMPONENT_SKIP_NOTE = "רכיבים מתעדכנים רק דרך הפריט הראשי";

/** "אומת" — physical check done now. Verifying a set verifies its components too. */
export async function verifyEquipment(ids: string[]): Promise<BulkResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const list = cleanIds(ids);
  if (!list.length) return { ok: false, message: "לא נבחרו פריטים" };
  const comps = await componentRowsOf(w.db, list);
  const { count } = await w.db.equipmentAssignment.updateMany({
    where: { OR: [{ itemId: { in: list } }, { id: { in: comps.map((c) => c.id) } }] },
    data: { lastVerifiedAt: new Date() },
  });
  refresh();
  return { ok: true, message: count === 1 ? "הפריט סומן כמאומת" : `${count} פריטים סומנו כמאומתים` };
}

/** Bulk-assign to a platoon. Items held by a soldier from another platoon are skipped. */
export async function bulkSetPlatoon(ids: string[], platoonRaw: string): Promise<BulkResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  const list = cleanIds(ids);
  const platoon = platoonRaw === "NONE" ? null : (PLATOONS as string[]).includes(platoonRaw) ? (platoonRaw as Platoon) : undefined;
  if (!list.length || platoon === undefined) return { ok: false, message: "בחירה לא תקינה" };

  const rows = await rowsOf(db, list);
  const components = rows.filter((r) => r.item.parentId);
  const heldElsewhere = rows.filter((r) => !r.item.parentId && r.soldier && r.soldier.platoon !== platoon);
  const eligible = rows.filter((r) => !r.item.parentId && (!r.soldier || r.soldier.platoon === platoon));
  const followers = await componentRowsOf(db, eligible.map((r) => r.itemId));
  const toChange = [...eligible, ...followers].filter((r) => r.platoon !== platoon);

  await db.$transaction([
    db.equipmentAssignment.updateMany({ where: { id: { in: toChange.map((r) => r.id) } }, data: { platoon } }),
    db.equipmentLog.createMany({
      data: toChange.map((r) => ({
        companyId: user.companyId,
        deploymentId: deployment.id,
        itemId: r.itemId,
        fromSoldierId: r.soldierId,
        toSoldierId: r.soldierId,
        fromStatus: r.status,
        toStatus: r.status,
        platoon,
        note: "שיוך מרוכז למחלקה",
        performedById: user.id,
      })),
    }),
  ]);
  refresh();
  const target = platoon ? PLATOON_LABELS[platoon] : "ללא מחלקה";
  const skips = [
    heldElsewhere.length ? `${heldElsewhere.length} דולגו (מוחזקים ע"י לוחם ממחלקה אחרת)` : "",
    components.length ? `${components.length} רכיבים דולגו (${COMPONENT_SKIP_NOTE})` : "",
  ].filter(Boolean);
  return { ok: true, message: [`${toChange.length} פריטים שויכו ל${target}`, ...skips].join(" · ") };
}

/** Bulk status change. "אצל לוחם" is only applied to items that have a holder. */
export async function bulkSetStatus(ids: string[], statusRaw: string): Promise<BulkResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  const list = cleanIds(ids);
  if (!list.length || !(EQUIPMENT_STATUSES as string[]).includes(statusRaw)) {
    return { ok: false, message: "בחירה לא תקינה" };
  }
  const status = statusRaw as EquipmentStatus;

  const rows = await rowsOf(db, list);
  const components = rows.filter((r) => r.item.parentId);
  const noHolder = rows.filter((r) => !r.item.parentId && status === "WITH_SOLDIER" && !r.soldierId);
  const eligible = rows.filter((r) => !r.item.parentId && (status !== "WITH_SOLDIER" || r.soldierId));
  const followers = await componentRowsOf(db, eligible.map((r) => r.itemId));
  const toChange = [...eligible, ...followers].filter((r) => r.status !== status);

  await db.$transaction([
    db.equipmentAssignment.updateMany({ where: { id: { in: toChange.map((r) => r.id) } }, data: { status } }),
    db.equipmentLog.createMany({
      data: toChange.map((r) => ({
        companyId: user.companyId,
        deploymentId: deployment.id,
        itemId: r.itemId,
        fromSoldierId: r.soldierId,
        toSoldierId: r.soldierId,
        fromStatus: r.status,
        toStatus: status,
        platoon: r.platoon,
        note: "עדכון סטטוס מרוכז",
        performedById: user.id,
      })),
    }),
  ]);
  refresh();
  const skips = [
    noHolder.length ? `${noHolder.length} דולגו (ללא לוחם משויך)` : "",
    components.length ? `${components.length} רכיבים דולגו (${COMPONENT_SKIP_NOTE})` : "",
  ].filter(Boolean);
  return {
    ok: true,
    message: [`${toChange.length} פריטים עודכנו ל"${EQUIPMENT_STATUS_LABELS[status]}"`, ...skips].join(" · "),
  };
}
