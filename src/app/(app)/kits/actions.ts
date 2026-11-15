"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { writableContext } from "@/lib/context";
import { AssignmentError, applyAssignment, ensureAssignment, NOT_IN_DEPLOYMENT_MESSAGE } from "@/lib/equipment-service";
import { checklistLines, kitItemsSelect, missingDescriptions, WEAPON_ITEM } from "@/lib/kit";
import { activeItemDefs, createKitStatuses } from "@/lib/kit-service";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

export type KitFormState = { ok?: boolean; message?: string; error?: string; errors?: FieldErrors; at?: number } | undefined;
export type KitResult = { ok: boolean; message?: string };

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

async function validKitNumber(db: Prisma.TransactionClient, companyId: string, n: number) {
  if (!Number.isInteger(n) || n < 1) return false;
  const company = await db.company.findUnique({ where: { id: companyId }, select: { kitCount: true } });
  return n <= (company?.kitCount ?? 0);
}

// Kits belong to a deployment (each deployment has its own kits 1..company.kitCount). Every action here works on
// the viewed deployment and needs it to be the active one (writableContext()).

/** Unique key of a kit: kit numbers repeat across deployments (and companies). */
function kitKey(deploymentId: string, kitNumber: number) {
  return { deploymentId_kitNumber: { deploymentId, kitNumber } };
}

/**
 * Kits 1..kitCount (and their checklist rows) are created when a deployment starts; create anything
 * missing lazily — e.g. a checklist item added since.
 */
async function ensureKit(db: Prisma.TransactionClient, ids: { companyId: string; deploymentId: string }, kitNumber: number) {
  if (!(await validKitNumber(db, ids.companyId, kitNumber))) throw new Error("Invalid kit number");
  const kit = await db.personalKit.upsert({
    where: kitKey(ids.deploymentId, kitNumber),
    update: {},
    create: { ...ids, kitNumber },
  });
  await createKitStatuses(db, { companyId: ids.companyId, kitIds: [kit.id] });
  return kit;
}

/** Set one checklist line of a kit. The item must be one of the company's active items. */
async function writeLine(
  db: Prisma.TransactionClient,
  ids: { companyId: string; deploymentId: string },
  kitNumber: number,
  itemId: string,
  value: { present?: boolean; quantity?: number },
) {
  const kit = await ensureKit(db, ids, kitNumber);
  const def = await db.kitItemDef.findFirst({ where: { id: itemId, isActive: true }, select: { id: true, targetQuantity: true } });
  if (!def) return false;
  const data =
    def.targetQuantity != null
      ? { quantity: value.quantity ?? (value.present ? def.targetQuantity : 0) }
      : { present: value.present ?? (value.quantity ?? 0) > 0 };
  await db.kitItemStatus.upsert({
    where: { kitId_itemId: { kitId: kit.id, itemId } },
    update: data,
    create: { companyId: ids.companyId, kitId: kit.id, itemId, ...data },
  });
  return true;
}

// ───────────── Assignment to a soldier ─────────────

export async function assignKit(kitNumber: number, _prev: KitFormState, fd: FormData): Promise<KitFormState> {
  const w = await writableContext();
  if (!w.ok) return { error: w.message };
  const { user, db, deployment } = w;
  const ids = { companyId: user.companyId, deploymentId: deployment.id };
  const kit = await ensureKit(db, ids, kitNumber);
  const soldierId = String(fd.get("soldierId") ?? "") || null;
  if (soldierId === kit.soldierId) return { ok: true, message: "לא בוצע שינוי", at: Date.now() };

  if (soldierId) {
    const soldier = await db.soldier.findFirst({ where: { id: soldierId, isActive: true }, select: { id: true } });
    if (!soldier) return { error: "הלוחם לא נמצא בסד\"כ" };
    if (await db.deploymentAbsence.findFirst({ where: { soldierId }, select: { id: true } })) return { error: NOT_IN_DEPLOYMENT_MESSAGE };
    const other = await db.personalKit.findFirst({ where: { soldierId }, select: { kitNumber: true } });
    if (other) return { error: `ללוחם כבר מונפקת ערכה ${other.kitNumber}` };
  }

  try {
    await db.personalKit.update({
      where: kitKey(deployment.id, kitNumber),
      data: {
        soldierId,
        // A new holder must sign again; the previous holder's weapon doesn't follow the bag.
        signedAt: null,
        signedById: null,
        signatureData: null,
        personalWeaponId: null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "ללוחם כבר מונפקת ערכה אחרת" };
    }
    throw e;
  }
  refresh();
  return { ok: true, message: soldierId ? "הערכה שויכה ללוחם" : "הערכה זוכתה והוחזרה למלאי", at: Date.now() };
}

// ───────────── Personal weapon ─────────────

const WeaponSchema = z.object({
  rifleType: z.preprocess(emptyToUndef, z.string().trim().max(30, "סוג הנשק ארוך מדי").optional()),
  personalWeaponId: z.preprocess(emptyToUndef, z.string().optional()),
  magazineCount: z.preprocess(
    (v) => (v === "" ? 0 : v),
    z.coerce.number({ error: "יש להזין מספר" }).int("מספר שלם").min(0, "לא שלילי").max(20, "לכל היותר 20"),
  ),
  ammoCount: z.preprocess(
    (v) => (v === "" ? 0 : v),
    z.coerce.number({ error: "יש להזין מספר" }).int("מספר שלם").min(0, "לא שלילי").max(2000, "לכל היותר 2,000"),
  ),
});

export async function updateWeapon(kitNumber: number, _prev: KitFormState, fd: FormData): Promise<KitFormState> {
  const w = await writableContext();
  if (!w.ok) return { error: w.message };
  const { user, db, deployment } = w;
  const ids = { companyId: user.companyId, deploymentId: deployment.id };
  const kit = await ensureKit(db, ids, kitNumber);
  const parsed = WeaponSchema.safeParse({
    rifleType: fd.get("rifleType") ?? "",
    personalWeaponId: fd.get("personalWeaponId") ?? "",
    magazineCount: fd.get("magazineCount") ?? "",
    ammoCount: fd.get("ammoCount") ?? "",
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const { rifleType, personalWeaponId, magazineCount, ammoCount } = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      let typeFromItem: string | undefined;
      if (personalWeaponId && personalWeaponId !== kit.personalWeaponId) {
        if (!kit.soldierId) throw new AssignmentError("יש לשייך את הערכה ללוחם לפני קישור נשק");
        const item = await tx.equipmentItem.findUnique({
          where: { id: personalWeaponId },
          select: { id: true, category: { select: { name: true } } },
        });
        if (!item) throw new AssignmentError("הפריט לא נמצא");
        // tx is scoped to this deployment: these are the rifle's kit link and holder here.
        const otherKit = await tx.personalKit.findFirst({ where: { personalWeaponId }, select: { kitNumber: true } });
        if (otherKit) throw new AssignmentError(`הנשק כבר רשום בערכה ${otherKit.kitNumber}`);
        const ctx = { ...ids, userId: user.id };
        const state = await ensureAssignment(tx, ctx, item.id);
        if (state.soldierId && state.soldierId !== kit.soldierId) {
          const holder = await tx.soldier.findUnique({ where: { id: state.soldierId }, select: { name: true } });
          throw new AssignmentError(`הנשק משויך ל${holder?.name ?? "לוחם אחר"}`);
        }
        // Hand the rifle to the soldier through the shared equipment rule (status, platoon, history log).
        if (!state.soldierId) {
          await applyAssignment(tx, ctx, personalWeaponId, { soldierId: kit.soldierId, note: `נשק אישי — ערכה ${kitNumber}` });
        }
        typeFromItem = item.category.name;
      }
      await tx.personalKit.update({
        where: kitKey(deployment.id, kitNumber),
        data: {
          personalWeaponId: personalWeaponId ?? null,
          rifleType: rifleType ?? typeFromItem ?? null,
          magazineCount,
          ammoCount,
        },
      });
      // Linking a rifle means the personal-weapon line of the checklist is fulfilled.
      if (personalWeaponId) {
        const weaponLine = await tx.kitItemDef.findFirst({ where: { systemKey: WEAPON_ITEM, isActive: true }, select: { id: true } });
        if (weaponLine) await writeLine(tx, ids, kitNumber, weaponLine.id, { present: true, quantity: 1 });
      }
    });
  } catch (e) {
    if (e instanceof AssignmentError) return { error: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "פרטי הנשק נשמרו", at: Date.now() };
}

// ───────────── Checklist / inspection ─────────────

const Id = z.string().min(1).max(100);
const Quantity = z.number().int().min(0).max(1000);

/** Single quick toggle (present / missing). */
export async function setKitItem(kitNumber: number, itemId: string, present: boolean): Promise<KitResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  if (!Id.safeParse(itemId).success || typeof present !== "boolean") return { ok: false, message: "פריט לא תקין" };
  const ids = { companyId: w.user.companyId, deploymentId: w.deployment.id };
  if (!(await writeLine(w.db, ids, kitNumber, itemId, { present }))) return { ok: false, message: "פריט לא תקין" };
  refresh();
  return { ok: true };
}

/** Counted items (e.g. magazines): set how many the soldier has. */
export async function setKitItemQuantity(kitNumber: number, itemId: string, quantity: number): Promise<KitResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  if (!Id.safeParse(itemId).success || !Quantity.safeParse(quantity).success) return { ok: false, message: "כמות לא תקינה" };
  const ids = { companyId: w.user.companyId, deploymentId: w.deployment.id };
  if (!(await writeLine(w.db, ids, kitNumber, itemId, { quantity }))) return { ok: false, message: "פריט לא תקין" };
  refresh();
  return { ok: true };
}

/** "הכל קיים" — mark every checklist line complete (counted items at their expected quantity). */
export async function setAllKitItems(kitNumber: number): Promise<KitResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { db } = w;
  const ids = { companyId: w.user.companyId, deploymentId: w.deployment.id };
  const kit = await ensureKit(db, ids, kitNumber); // also creates rows for items added since
  const targets = [...new Set((await activeItemDefs(db)).map((d) => d.targetQuantity).filter((t): t is number => t != null))];
  // A few bulk updates (plain items → present; counted items → their expected quantity).
  await db.$transaction([
    db.kitItemStatus.updateMany({ where: { kitId: kit.id, item: { isActive: true, targetQuantity: null } }, data: { present: true } }),
    ...targets.map((t) =>
      db.kitItemStatus.updateMany({ where: { kitId: kit.id, item: { isActive: true, targetQuantity: t } }, data: { quantity: t } }),
    ),
  ]);
  refresh();
  return { ok: true };
}

/** Close a מסדר: snapshot what's missing right now (by name, as items are called today). */
export async function completeInspection(kitNumber: number, note: string): Promise<KitResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  const kit = await db.personalKit.findUnique({
    where: kitKey(deployment.id, kitNumber),
    select: { id: true, soldierId: true, ...kitItemsSelect },
  });
  if (!kit) return { ok: false, message: "הערכה לא נמצאה" };
  if (!kit.soldierId) return { ok: false, message: "לא ניתן לבצע מסדר לערכה שלא הונפקה" };
  const lines = checklistLines(kit.items, { history: false, activeDefs: await activeItemDefs(db) });
  const missing = missingDescriptions(lines);
  const cleanNote = note.trim().slice(0, 300) || null;

  await db.$transaction([
    db.kitInspection.create({
      data: { companyId: user.companyId, kitId: kit.id, missingItems: missing, note: cleanNote, performedById: user.id },
    }),
    db.personalKit.update({ where: kitKey(deployment.id, kitNumber), data: { lastInspectedAt: new Date() } }),
  ]);
  refresh();
  return {
    ok: true,
    message:
      missing.length === 0
        ? "מסדר נרשם — הערכה מלאה"
        : missing.length === 1
          ? "מסדר נרשם — פריט אחד חסר"
          : `מסדר נרשם — ${missing.length} פריטים חסרים`,
  };
}

// ───────────── Digital signature ─────────────

const MAX_SIGNATURE_BYTES = 200_000;

export async function signKit(kitNumber: number, signatureData: string): Promise<KitResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  if (
    typeof signatureData !== "string" ||
    !signatureData.startsWith("data:image/png;base64,") ||
    signatureData.length > MAX_SIGNATURE_BYTES
  ) {
    return { ok: false, message: "חתימה לא תקינה" };
  }
  const kit = await db.personalKit.findUnique({ where: kitKey(deployment.id, kitNumber), select: { soldierId: true } });
  if (!kit?.soldierId) return { ok: false, message: "יש לשייך את הערכה ללוחם לפני החתמה" };
  await db.personalKit.update({
    where: kitKey(deployment.id, kitNumber),
    data: { signatureData, signedAt: new Date(), signedById: user.id },
  });
  refresh();
  return { ok: true, message: "הלוחם הוחתם על הערכה" };
}

export async function clearSignature(kitNumber: number): Promise<KitResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { db, deployment } = w;
  await db.personalKit.update({
    where: kitKey(deployment.id, kitNumber),
    data: { signatureData: null, signedAt: null, signedById: null },
  });
  refresh();
  return { ok: true };
}
