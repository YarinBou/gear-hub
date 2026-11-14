"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { EquipmentStatus, Platoon } from "@/generated/prisma/enums";
import { companyContext, adminContext } from "@/lib/context";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS, PLATOONS, PLATOON_LABELS } from "@/lib/constants";
import { resolveStatus } from "@/lib/equipment-rules";
import { AssignmentError, applyAssignment, attachComponent, detachComponent } from "@/lib/equipment-service";
import {
  AssignSchema,
  CreateEquipmentSchema,
  NoSerialQuantitySchema,
  SerialListSchema,
  toFieldErrors,
  UpdateDetailsSchema,
  type FieldErrors,
} from "@/lib/validation/equipment";

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
  const { user, db } = await companyContext();
  const values = formValues(fd, ["categoryId", "serials", "quantity", "noSerial", "status", "soldierId", "platoon", "notes"]);
  const parsed = CreateEquipmentSchema.safeParse(values);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values };
  const { categoryId, notes, noSerial } = parsed.data;

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

  let created: { id: string }[];
  try {
    created = await db.$transaction(async (tx) => {
      const items = await tx.equipmentItem.createManyAndReturn({
        data: serials.map((serialNumber) => ({
          companyId: user.companyId,
          serialNumber,
          categoryId,
          status: resolved.status,
          assignedSoldierId: parsed.data.soldierId ?? null,
          platoon,
          notes,
        })),
        select: { id: true },
      });
      await tx.equipmentLog.createMany({
        data: items.map((i) => ({
          companyId: user.companyId,
          itemId: i.id,
          toSoldierId: parsed.data.soldierId ?? null,
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

export async function assignEquipment(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { user, db } = await companyContext();
  const values = formValues(fd, ["soldierId", "status", "platoon", "note", "verify"]);
  const parsed = AssignSchema.safeParse(values);
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values };
  const d = parsed.data;
  try {
    await db.$transaction((tx) =>
      applyAssignment(
        tx,
        id,
        {
          soldierId: d.soldierId ?? null,
          status: d.status as EquipmentStatus | undefined,
          platoon: (d.platoon as Platoon | undefined) ?? null,
          note: d.note,
          verify: d.verify,
        },
        user.id,
      ),
    );
  } catch (e) {
    if (e instanceof AssignmentError) return { error: e.message, values };
    throw e;
  }
  refresh();
  return { ok: true, message: "השיוך עודכן", at: Date.now() };
}

export async function deleteEquipment(id: string, _prev: FormState, _fd: FormData): Promise<FormState> {
  const { db } = await adminContext();
  const kit = await db.personalKit.findFirst({ where: { personalWeaponId: id }, select: { kitNumber: true } });
  if (kit) return { error: `הפריט רשום כנשק אישי בערכה ${kit.kitNumber}. יש לנתק אותו מהערכה תחילה.` };
  // Components are detached automatically (parentId → null) and stay with their current holder.
  await db.equipmentItem.delete({ where: { id } });
  redirect("/equipment");
}

// ───────────── Linked sets ─────────────

export type SimpleResult = { ok: boolean; message?: string };

export async function attachComponentAction(parentId: string, childId: string): Promise<SimpleResult> {
  const { user, db } = await companyContext();
  if (typeof childId !== "string" || !childId) return { ok: false, message: "יש לבחור פריט" };
  try {
    await db.$transaction((tx) => attachComponent(tx, parentId, childId, user.id));
  } catch (e) {
    if (e instanceof AssignmentError) return { ok: false, message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "הרכיב צורף" };
}

export async function detachComponentAction(childId: string): Promise<SimpleResult> {
  const { user, db } = await companyContext();
  try {
    await db.$transaction((tx) => detachComponent(tx, childId, user.id));
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

/** Components of the given parents (they always follow their parent). */
async function componentsOf(db: PrismaClient, parentIds: string[]) {
  if (!parentIds.length) return [];
  return db.equipmentItem.findMany({
    where: { parentId: { in: parentIds } },
    select: { id: true, status: true, platoon: true, assignedSoldierId: true },
  });
}

const COMPONENT_SKIP_NOTE = "רכיבים מתעדכנים רק דרך הפריט הראשי";

/** "אומת" — physical check done now. Verifying a set verifies its components too. */
export async function verifyEquipment(ids: string[]): Promise<BulkResult> {
  const { db } = await companyContext();
  const list = cleanIds(ids);
  if (!list.length) return { ok: false, message: "לא נבחרו פריטים" };
  const comps = await componentsOf(db, list);
  const { count } = await db.equipmentItem.updateMany({
    where: { id: { in: [...list, ...comps.map((c) => c.id)] } },
    data: { lastVerifiedAt: new Date() },
  });
  refresh();
  return { ok: true, message: count === 1 ? "הפריט סומן כמאומת" : `${count} פריטים סומנו כמאומתים` };
}

/** Bulk-assign to a platoon. Items held by a soldier from another platoon are skipped. */
export async function bulkSetPlatoon(ids: string[], platoonRaw: string): Promise<BulkResult> {
  const { user, db } = await companyContext();
  const list = cleanIds(ids);
  const platoon = platoonRaw === "NONE" ? null : (PLATOONS as string[]).includes(platoonRaw) ? (platoonRaw as Platoon) : undefined;
  if (!list.length || platoon === undefined) return { ok: false, message: "בחירה לא תקינה" };

  const items = await db.equipmentItem.findMany({
    where: { id: { in: list } },
    select: {
      id: true,
      parentId: true,
      platoon: true,
      status: true,
      assignedSoldierId: true,
      assignedSoldier: { select: { platoon: true } },
    },
  });
  const components = items.filter((i) => i.parentId);
  const heldElsewhere = items.filter((i) => !i.parentId && i.assignedSoldier && i.assignedSoldier.platoon !== platoon);
  const eligible = items.filter((i) => !i.parentId && (!i.assignedSoldier || i.assignedSoldier.platoon === platoon));
  const followers = await componentsOf(db, eligible.map((i) => i.id));
  const toChange = [...eligible, ...followers].filter((i) => i.platoon !== platoon);

  await db.$transaction([
    db.equipmentItem.updateMany({ where: { id: { in: toChange.map((i) => i.id) } }, data: { platoon } }),
    db.equipmentLog.createMany({
      data: toChange.map((i) => ({
        companyId: user.companyId,
        itemId: i.id,
        fromSoldierId: i.assignedSoldierId,
        toSoldierId: i.assignedSoldierId,
        fromStatus: i.status,
        toStatus: i.status,
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
  const { user, db } = await companyContext();
  const list = cleanIds(ids);
  if (!list.length || !(EQUIPMENT_STATUSES as string[]).includes(statusRaw)) {
    return { ok: false, message: "בחירה לא תקינה" };
  }
  const status = statusRaw as EquipmentStatus;

  const items = await db.equipmentItem.findMany({
    where: { id: { in: list } },
    select: { id: true, parentId: true, status: true, platoon: true, assignedSoldierId: true },
  });
  const components = items.filter((i) => i.parentId);
  const noHolder = items.filter((i) => !i.parentId && status === "WITH_SOLDIER" && !i.assignedSoldierId);
  const eligible = items.filter((i) => !i.parentId && (status !== "WITH_SOLDIER" || i.assignedSoldierId));
  const followers = await componentsOf(db, eligible.map((i) => i.id));
  const toChange = [...eligible, ...followers].filter((i) => i.status !== status);

  await db.$transaction([
    db.equipmentItem.updateMany({ where: { id: { in: toChange.map((i) => i.id) } }, data: { status } }),
    db.equipmentLog.createMany({
      data: toChange.map((i) => ({
        companyId: user.companyId,
        itemId: i.id,
        fromSoldierId: i.assignedSoldierId,
        toSoldierId: i.assignedSoldierId,
        fromStatus: i.status,
        toStatus: status,
        platoon: i.platoon,
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
