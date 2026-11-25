"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { EquipmentStatus } from "@/generated/prisma/enums";
import { adminContext, companyContext, readOnlyMessage, writableContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";
import { resolveStatus } from "@/lib/equipment-rules";
import {
  AssignmentError,
  HolderConflictError,
  applyAssignment,
  attachComponent,
  createNoSerialComponent,
  signOutSet,
  detachComponent,
  NOT_IN_DEPLOYMENT_MESSAGE,
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
import { SignSetSchema, type SignSetInput } from "@/lib/equipment-sets";
import { describeValue, parseAttributeDefs, parseAttributeValues, type AttributeValues } from "@/lib/equipment-attributes";

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
      /** Delete only: the item has history; these warnings must be confirmed (force=1) to delete anyway. */
      historyWarnings?: string[];
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
  const attrKeys = [...fd.keys()].filter((k) => k.startsWith("attr_"));
  const values = formValues(fd, ["categoryId", "serials", "quantity", "noSerial", "status", "soldierId", "platoon", "notes", ...attrKeys]);
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
    select: { id: true, attributes: true },
  });
  if (!category) return { errors: { categoryId: "סוג פריט לא תקין" }, values };
  // The type's properties, as set on the form (attr_<key>: "yes" / "no" / an option / "" = not recorded).
  const attributes: AttributeValues = {};
  for (const d of parseAttributeDefs(category.attributes)) {
    const raw = String(fd.get(`attr_${d.key}`) ?? "");
    if (d.kind === "check" && (raw === "yes" || raw === "no")) attributes[d.key] = raw === "yes";
    if (d.kind === "choice" && d.options.includes(raw)) attributes[d.key] = raw;
  }

  let platoonId = parsed.data.platoon ?? null;
  if (platoonId && !(await db.platoon.findFirst({ where: { id: platoonId, isActive: true }, select: { id: true } }))) {
    return { errors: { platoon: "מחלקה לא תקינה" }, values };
  }
  if (parsed.data.soldierId) {
    const soldier = await db.soldier.findFirst({
      where: { id: parsed.data.soldierId, isActive: true },
      select: { platoonId: true },
    });
    if (!soldier) return { errors: { soldierId: "הלוחם לא נמצא" }, values };
    if (await db.deploymentAbsence.findFirst({ where: { soldierId: parsed.data.soldierId }, select: { id: true } })) {
      return { errors: { soldierId: NOT_IN_DEPLOYMENT_MESSAGE }, values };
    }
    platoonId = soldier.platoonId;
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
        data: serials.map((serialNumber) => ({ companyId: user.companyId, serialNumber, categoryId, notes, attributes })),
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
            platoonId,
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
          platoonId,
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
        // A set belongs to one main type — changing the type drops it.
        ...(await db.equipmentSet.count({ where: { items: { some: { id } }, mainCategoryId: category.id } })
          ? {}
          : { setId: null }),
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: { serialNumber: 'מספר צ / מס"ט זה כבר קיים במערכת' }, values };
    throw e;
  }
  refresh();
  return { ok: true, message: "הפרטים נשמרו" };
}

/**
 * Record an item's properties (מאפיינים: קייס, שלט PTT, מתאם לקסדה, צבע…). `changes` by key: true /
 * false, an option, or null to clear. Any user; each change is written to the item's history.
 */
export async function setItemAttributes(id: string, changes: Record<string, boolean | string | null>): Promise<SimpleResult> {
  const { user, db } = await companyContext();
  if (!changes || typeof changes !== "object") return { ok: false, message: "בקשה לא תקינה" };
  const item = await db.equipmentItem.findUnique({
    where: { id },
    select: { id: true, attributes: true, category: { select: { attributes: true } } },
  });
  if (!item) return { ok: false, message: "הפריט לא נמצא" };
  const defs = parseAttributeDefs(item.category.attributes);
  const before = parseAttributeValues(item.attributes, defs);
  const after: AttributeValues = { ...before };
  const notes: string[] = [];
  for (const d of defs) {
    if (!(d.key in changes)) continue;
    const v = changes[d.key];
    const ok = v === null || (d.kind === "check" ? typeof v === "boolean" : typeof v === "string" && d.options.includes(v));
    if (!ok) return { ok: false, message: `ערך לא תקין ל${d.label}` };
    if (v === null) delete after[d.key];
    else after[d.key] = v;
    if (before[d.key] !== after[d.key]) notes.push(`${d.label}: ${describeValue(d, before[d.key])} ← ${describeValue(d, after[d.key])}`);
  }
  if (!notes.length) return { ok: true };
  // History entries belong to the company's active deployment, if there is one.
  const active = await scopedDb(user.companyId).deployment.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
  await db.$transaction([
    db.equipmentItem.update({ where: { id }, data: { attributes: after } }),
    db.equipmentLog.create({
      data: { companyId: user.companyId, deploymentId: active?.id ?? null, itemId: id, note: notes.join(" · "), performedById: user.id },
    }),
  ]);
  refresh();
  return { ok: true, message: "נשמר" };
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
        platoonId: d.platoon ?? null,
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
 * Admin only, for items entered by mistake. When the item already has history (assignment moves,
 * or it is a kit's personal weapon), the first call returns warnings instead of deleting; the
 * admin can then confirm with force=1, which deletes the item together with all its history.
 */
export async function deleteEquipment(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await adminContext();
  const companyDb = scopedDb(user.companyId); // across all deployments
  const force = fd.get("force") === "1";
  if (!force) {
    const [kits, moves] = await Promise.all([
      companyDb.personalKit.findMany({
        where: { personalWeaponId: id },
        select: { kitNumber: true, deployment: { select: { name: true } } },
      }),
      companyDb.equipmentLog.count({ where: { itemId: id, fromStatus: { not: null } } }),
    ]);
    const historyWarnings = [
      ...(moves ? [`לפריט יש ${moves} רשומות בהיסטוריית השיוכים — כולן יימחקו.`] : []),
      ...kits.map((k) => `הפריט רשום כנשק אישי בערכה ${k.kitNumber} (${k.deployment.name}) — הוא ינותק מהערכה.`),
    ];
    if (historyWarnings.length) return { historyWarnings };
  }
  // Logs and per-deployment states cascade; kits' personal weapon and components' parent are set to null.
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
  return { db, ctx, user } as const;
}

export type AttachResult = SimpleResult & { conflict?: HolderConflictError["conflict"] };

/**
 * Attach a component. If it is held by a different soldier than the main item, the first call
 * returns `conflict` and the user picks:
 *  - "takeOver": the component moves to the main item's holder (or the armory, if it has none);
 *  - "moveSet": the main item (with everything attached) moves to the component's holder first.
 */
export async function attachComponentAction(
  parentId: string,
  childId: string,
  mode?: "takeOver" | "moveSet",
): Promise<AttachResult> {
  if (typeof childId !== "string" || !childId) return { ok: false, message: "יש לבחור פריט" };
  const l = await linkContext();
  if ("error" in l) return { ok: false, message: l.error };
  const ctx = l.ctx;
  try {
    await l.db.$transaction(async (tx) => {
      if (mode === "moveSet" && ctx) {
        const childRow = await tx.equipmentAssignment.findUnique({
          where: { deploymentId_itemId: { deploymentId: ctx.deploymentId, itemId: childId } },
          select: { soldierId: true },
        });
        if (childRow?.soldierId) {
          await applyAssignment(tx, ctx, parentId, { soldierId: childRow.soldierId, note: "הועבר כדי לצרף רכיב שמוחזק אצל הלוחם" });
        }
      }
      await attachComponent(tx, ctx, parentId, childId, { takeOver: mode === "takeOver" });
    });
  } catch (e) {
    if (e instanceof HolderConflictError) return { ok: false, message: e.message, conflict: e.conflict };
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
  platoonId: true,
  soldierId: true,
  soldier: { select: { platoonId: true } },
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
  const platoonId = platoonRaw === "NONE" ? null : typeof platoonRaw === "string" ? platoonRaw : undefined;
  const platoon = platoonId ? await db.platoon.findUnique({ where: { id: platoonId }, select: { name: true } }) : null;
  if (platoonId && !platoon) return { ok: false, message: "בחירה לא תקינה" };
  if (!list.length || platoonId === undefined) return { ok: false, message: "בחירה לא תקינה" };

  const rows = await rowsOf(db, list);
  const components = rows.filter((r) => r.item.parentId);
  const heldElsewhere = rows.filter((r) => !r.item.parentId && r.soldier && r.soldier.platoonId !== platoonId);
  const eligible = rows.filter((r) => !r.item.parentId && (!r.soldier || r.soldier.platoonId === platoonId));
  const followers = await componentRowsOf(db, eligible.map((r) => r.itemId));
  const toChange = [...eligible, ...followers].filter((r) => r.platoonId !== platoonId);

  await db.$transaction([
    db.equipmentAssignment.updateMany({ where: { id: { in: toChange.map((r) => r.id) } }, data: { platoonId } }),
    db.equipmentLog.createMany({
      data: toChange.map((r) => ({
        companyId: user.companyId,
        deploymentId: deployment.id,
        itemId: r.itemId,
        fromSoldierId: r.soldierId,
        toSoldierId: r.soldierId,
        fromStatus: r.status,
        toStatus: r.status,
        platoonId,
        note: "שיוך מרוכז למחלקה",
        performedById: user.id,
      })),
    }),
  ]);
  refresh();
  const target = platoon ? platoon.name : "ללא מחלקה";
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
        platoonId: r.platoonId,
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

// ───────────── Sets (מארזים) ─────────────

/** Sign a whole set out to a soldier: main item + attached / new "ללא צ" components, in one go. */
export async function signSetAction(input: SignSetInput): Promise<SimpleResult & { itemId?: string }> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const parsed = SignSetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "בחירה לא תקינה" };
  try {
    const r = await w.db.$transaction((tx) => signOutSet(tx, deploymentCtx(w), parsed.data), { timeout: 30_000 });
    refresh();
    return { ok: true, message: "המארז הוחתם", itemId: r.mainItemId };
  } catch (e) {
    if (e instanceof AssignmentError) return { ok: false, message: e.message };
    throw e;
  }
}

/** Record which set an item is the main item of (null = none). Company-level, like linking. */
export async function setItemSetAction(itemId: string, setId: string | null): Promise<SimpleResult> {
  const l = await linkContext();
  if ("error" in l) return { ok: false, message: l.error };
  const item = await l.db.equipmentItem.findUnique({ where: { id: itemId }, select: { categoryId: true, parentId: true } });
  if (!item) return { ok: false, message: "הפריט לא נמצא" };
  if (setId) {
    if (item.parentId) return { ok: false, message: "רכיב של פריט אחר לא יכול להיות פריט ראשי של מארז" };
    const set = await l.db.equipmentSet.findUnique({ where: { id: setId }, select: { mainCategoryId: true } });
    if (!set || set.mainCategoryId !== item.categoryId) return { ok: false, message: "המארז אינו מתאים לסוג הפריט" };
  }
  await l.db.equipmentItem.update({ where: { id: itemId }, data: { setId } });
  refresh();
  return { ok: true };
}

/** Fill a missing set line with a new "ללא צ" item (its serial can be added later on its page). */
export async function addNoSerialComponentAction(parentId: string, categoryId: string): Promise<SimpleResult> {
  const l = await linkContext();
  if ("error" in l) return { ok: false, message: l.error };
  try {
    await l.db.$transaction((tx) =>
      createNoSerialComponent(
        tx,
        { companyId: l.user.companyId, userId: l.user.id, deploymentId: l.ctx?.deploymentId ?? null },
        parentId,
        categoryId,
      ),
    );
  } catch (e) {
    if (e instanceof AssignmentError) return { ok: false, message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: 'נוסף רכיב "ללא צ"' };
}
