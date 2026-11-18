"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { writableContext } from "@/lib/context";
import { AssignmentError, applyAssignment, ensureAssignment, NOT_IN_DEPLOYMENT_MESSAGE } from "@/lib/equipment-service";
import { checklistLines, kitItemsSelect, MAX_EXTRA_AMMO, missingDescriptions, WEAPON_ITEM, type ExtraAmmo } from "@/lib/kit";
import { activeItemDefs, captureBaseline, createKitStatuses, fillKit } from "@/lib/kit-service";
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
    // What the previous holder signed for doesn't apply to the new one.
    await db.kitItemStatus.updateMany({ where: { kitId: kit.id }, data: { baseline: null } });
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

/**
 * Extra-ammo lines from the form (extraLabel[] / extraQty[] pairs). Rows left completely empty are
 * ignored; a label needs a quantity and the other way round. The same label twice is merged.
 */
function readExtraAmmo(fd: FormData): { lines: ExtraAmmo[] } | { error: string } {
  const labels = fd.getAll("extraLabel").map((v) => String(v).trim());
  const qtys = fd.getAll("extraQty").map((v) => String(v).trim());
  const merged = new Map<string, number>();
  for (let i = 0; i < Math.max(labels.length, qtys.length); i++) {
    const label = labels[i] ?? "";
    const raw = qtys[i] ?? "";
    if (!label && !raw) continue;
    if (!label) return { error: "יש להזין סוג לכל שורת תחמושת נוספת" };
    if (label.length > 30) return { error: "סוג התחמושת ארוך מדי" };
    const quantity = Number(raw);
    if (!raw || !Number.isInteger(quantity) || quantity < 1 || quantity > 200) {
      return { error: `כמות ל"${label}": מספר שלם בין 1 ל-200` };
    }
    merged.set(label, (merged.get(label) ?? 0) + quantity);
  }
  if (merged.size > MAX_EXTRA_AMMO) return { error: `לכל היותר ${MAX_EXTRA_AMMO} שורות תחמושת נוספת` };
  return { lines: [...merged].map(([label, quantity]) => ({ label, quantity })) };
}

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
  const extra = readExtraAmmo(fd);
  if ("error" in extra) return { errors: { extraAmmo: extra.error } };

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
          extraAmmo: extra.lines,
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

/**
 * "הכל קיים" — mark every line that is part of this kit complete (counted items at the quantity the
 * soldier signed for, or the list's quantity). Lines the soldier didn't sign for are left alone.
 */
export async function setAllKitItems(kitNumber: number): Promise<KitResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { db } = w;
  const ids = { companyId: w.user.companyId, deploymentId: w.deployment.id };
  const kit = await ensureKit(db, ids, kitNumber); // also creates rows for items added since
  await db.$transaction((tx) => fillKit(tx, kit.id));
  refresh();
  return { ok: true };
}

/**
 * Correct what the soldier signed for on one line: 0 = not part of this kit, n = the signed
 * quantity (plain lines: 1 = signed for).
 */
export async function setKitBaseline(kitNumber: number, itemId: string, baseline: number): Promise<KitResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  if (!Id.safeParse(itemId).success || !Quantity.safeParse(baseline).success) return { ok: false, message: "כמות לא תקינה" };
  const { db } = w;
  const ids = { companyId: w.user.companyId, deploymentId: w.deployment.id };
  const kit = await ensureKit(db, ids, kitNumber);
  if (!kit.soldierId) return { ok: false, message: "הערכה לא הונפקה ללוחם" };
  const def = await db.kitItemDef.findFirst({ where: { id: itemId, isActive: true }, select: { targetQuantity: true } });
  if (!def) return { ok: false, message: "פריט לא תקין" };
  const value = def.targetQuantity == null ? Math.min(baseline, 1) : baseline;
  await db.kitItemStatus.update({ where: { kitId_itemId: { kitId: kit.id, itemId } }, data: { baseline: value } });
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
  const ids = { companyId: user.companyId, deploymentId: deployment.id };
  await db.$transaction(async (tx) => {
    const k = await ensureKit(tx, ids, kitNumber); // rows for items added since
    await tx.personalKit.update({ where: { id: k.id }, data: { signatureData, signedAt: new Date(), signedById: user.id } });
    // What is marked now is what the soldier signs for.
    await captureBaseline(tx, k.id);
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
