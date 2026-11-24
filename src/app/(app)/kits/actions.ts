"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { writableContext } from "@/lib/context";
import { AssignmentError, applyAssignment, ensureAssignment, NOT_IN_DEPLOYMENT_MESSAGE } from "@/lib/equipment-service";
import {
  checklistLines,
  coversWholeKit,
  kitItemsSelect,
  missingDescriptions,
  returnCheckLines,
  WEAPON_ITEM,
  type ReturnLine,
} from "@/lib/kit";
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
  const def = await db.kitItemDef.findFirst({
    where: { id: itemId, isActive: true },
    select: { id: true, targetQuantity: true, optional: true },
  });
  if (!def) return false;
  const data: { quantity?: number; present?: boolean; baseline?: number | null } =
    def.targetQuantity != null
      ? { quantity: value.quantity ?? (value.present ? def.targetQuantity : 0) }
      : { present: value.present ?? (value.quantity ?? 0) > 0 };
  // Marking something as there on a line that isn't part of this kit (not signed for, or an optional
  // item) adds it to the kit: it now counts as signed for, at the amount found. Until the kit is
  // signed, an optional line keeps following what is in the bag (0 takes it out again).
  const have = def.targetQuantity != null ? data.quantity! : data.present ? 1 : 0;
  const row = await db.kitItemStatus.findUnique({ where: { kitId_itemId: { kitId: kit.id, itemId } }, select: { baseline: true } });
  const baseline = row?.baseline ?? null;
  if (def.optional && !kit.signedAt) data.baseline = have > 0 ? have : null;
  else if (have > 0 && (baseline === 0 || (baseline === null && def.optional))) data.baseline = have;
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
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const { rifleType, personalWeaponId } = parsed.data;

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
  const lines = checklistLines(kit.items, { history: false, activeDefs: await activeItemDefs(db), pakal: kit.pakal });
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

/**
 * בדיקת תכולה: every line of a kit in stock was checked — what is marked now is what is in the bag.
 * Records it in the kit's history (with what is short against the list) and marks the kit as checked.
 */
export async function completeContentsCheck(kitNumber: number, note: string): Promise<KitResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  const ids = { companyId: user.companyId, deploymentId: deployment.id };
  const result = await db.$transaction(async (tx) => {
    const k = await ensureKit(tx, ids, kitNumber);
    const kit = await tx.personalKit.findUniqueOrThrow({ where: { id: k.id }, select: { id: true, soldierId: true, ...kitItemsSelect } });
    if (kit.soldierId) return { error: "בדיקת תכולה נעשית לתיק שבמלאי. לתיק מונפק — מסדר" };
    const lines = checklistLines(kit.items, { history: false, activeDefs: await activeItemDefs(tx), pakal: kit.pakal });
    // The weapon is not kept in a bag in stock.
    const missing = missingDescriptions(lines.filter((l) => l.systemKey !== WEAPON_ITEM));
    const now = new Date();
    await tx.kitInspection.create({
      data: {
        companyId: user.companyId,
        kitId: kit.id,
        missingItems: missing,
        fullCheck: true,
        note: (typeof note === "string" ? note.trim().slice(0, 300) : "") || null,
        performedById: user.id,
      },
    });
    await tx.personalKit.update({ where: { id: kit.id }, data: { contentsCheckedAt: now, contentsCheckedById: user.id } });
    return { missing: missing.length };
  });
  if ("error" in result) return { ok: false, message: result.error };
  refresh();
  return {
    ok: true,
    message:
      result.missing === 0
        ? "בדיקת התכולה נרשמה — התיק מלא"
        : result.missing === 1
          ? "בדיקת התכולה נרשמה — פריט אחד חסר"
          : `בדיקת התכולה נרשמה — ${result.missing} פריטים חסרים`,
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

// ───────────── Kit return (זיכוי ערכה) ─────────────

export type ReturnKitInput = {
  /** The holder the user is returning the kit from — refused if the kit has changed hands since. */
  soldierId: string;
  /** What came back, by ReturnCheckLine.key (missing key = nothing came back). */
  returned: Record<string, number>;
  /** Free text next to a gap (e.g. אובדן / נהרס), by key. */
  gapNotes: Record<string, string>;
  note?: string;
};

/**
 * The soldier hands the kit back. What they signed for is checked against what came back; gaps
 * are recorded (with their notes) but never block it. Then the kit form is reset: no soldier, no
 * signature, no weapon link / magazines / ammo. The checklist keeps what actually came back, so the
 * kit (and the totals) show its real contents until it is filled up. The weapon itself is not
 * touched here — it is returned separately on the צל"ם side.
 */
export async function returnKit(
  kitNumber: number,
  input: ReturnKitInput,
): Promise<KitResult & { gaps?: number; fullCheck?: boolean }> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  if (!input || typeof input !== "object" || typeof input.soldierId !== "string") return { ok: false, message: "בקשה לא תקינה" };
  const returned = input.returned && typeof input.returned === "object" ? input.returned : {};
  const gapNotes = input.gapNotes && typeof input.gapNotes === "object" ? input.gapNotes : {};
  const ids = { companyId: user.companyId, deploymentId: deployment.id };

  const result = await db.$transaction(async (tx) => {
    const k = await ensureKit(tx, ids, kitNumber);
    const kit = await tx.personalKit.findUniqueOrThrow({
      where: { id: k.id },
      select: {
        id: true,
        soldierId: true,
        signedAt: true,
        soldier: { select: { name: true } },
        ...kitItemsSelect,
      },
    });
    if (!kit.soldierId || !kit.soldier) return { error: "הערכה אינה מונפקת ללוחם" };
    if (kit.soldierId !== input.soldierId) return { error: "הערכה הועברה ללוחם אחר בינתיים — יש לרענן את הדף" };

    const lines = checklistLines(kit.items, { history: false, activeDefs: await activeItemDefs(tx), pakal: kit.pakal });
    const check = returnCheckLines(lines);
    const record: ReturnLine[] = check.map((c) => {
      const raw = Number(returned[c.key]);
      const got = Number.isInteger(raw) ? Math.min(Math.max(raw, 0), c.expected) : 0;
      const note = got < c.expected && typeof gapNotes[c.key] === "string" ? gapNotes[c.key].trim().slice(0, 200) : "";
      return { label: c.label, expected: c.expected, returned: got, ...(note ? { note } : {}) };
    });
    const gaps = record.filter((l) => l.returned < l.expected).length;
    // A return checks what was signed for. When that was the whole kit, its contents are now known;
    // when the soldier signed for only part of it, the rest of the bag still needs a contents check.
    const fullCheck = !!kit.signedAt && coversWholeKit(lines);

    await tx.kitReturn.create({
      data: {
        companyId: user.companyId,
        kitId: kit.id,
        soldierId: kit.soldierId,
        soldierName: kit.soldier.name,
        lines: record,
        gapCount: gaps,
        note: typeof input.note === "string" ? input.note.trim().slice(0, 300) || null : null,
        performedById: user.id,
      },
    });

    // Reset the form: back in the company's stock, ready for the next soldier. The checklist keeps
    // what actually came back — the kit shows its real contents until someone fills it up.
    await tx.personalKit.update({
      where: { id: kit.id },
      data: {
        soldierId: null,
        signedAt: null,
        signedById: null,
        signatureData: null,
        personalWeaponId: null,
        rifleType: null,
        contentsCheckedAt: fullCheck ? new Date() : null,
        contentsCheckedById: fullCheck ? user.id : null,
      },
    });
    const back = new Map(check.map((c, i) => [c.key, record[i].returned]));
    for (const l of lines) {
      const got = back.get(l.itemId);
      // The weapon line follows the weapon link, which was just removed.
      const weapon = l.systemKey === WEAPON_ITEM;
      if (got === undefined && !weapon) {
        await tx.kitItemStatus.updateMany({ where: { kitId: kit.id, itemId: l.itemId }, data: { baseline: null } });
        continue;
      }
      const n = weapon ? 0 : got!;
      const data = l.targetQuantity != null ? { quantity: n, baseline: null } : { present: n > 0, baseline: null };
      await tx.kitItemStatus.upsert({
        where: { kitId_itemId: { kitId: kit.id, itemId: l.itemId } },
        update: data,
        create: { companyId: user.companyId, kitId: kit.id, itemId: l.itemId, ...data },
      });
    }
    return { gaps, fullCheck };
  });

  if ("error" in result) return { ok: false, message: result.error };
  refresh();
  const outcome =
    result.gaps === 0 ? "הערכה זוכתה — הכל חזר" : result.gaps === 1 ? "הערכה זוכתה — פער אחד נרשם" : `הערכה זוכתה — ${result.gaps} פערים נרשמו`;
  return {
    ok: true,
    gaps: result.gaps,
    fullCheck: result.fullCheck,
    message: result.fullCheck ? outcome : `${outcome}. הלוחם לא היה חתום על כל התיק — מומלץ לבצע בדיקת תכולה`,
  };
}

// ───────────── תיק פק"ל ─────────────

/**
 * Mark a kit as a פק"ל kit (or a regular one). Admin only. The mark belongs to the physical bag:
 * it stays through returns and reissues and carries into the next deployment.
 */
export async function setKitPakal(kitNumber: number, pakalId: string | null): Promise<KitResult> {
  const w = await writableContext({ admin: true }); // admins only
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  if (pakalId !== null && typeof pakalId !== "string") return { ok: false, message: "בחירה לא תקינה" };
  if (pakalId && !(await db.pakal.findFirst({ where: { id: pakalId, isActive: true }, select: { id: true } }))) {
    return { ok: false, message: 'הפק"ל לא נמצא' };
  }
  await db.$transaction(async (tx) => {
    const kit = await ensureKit(tx, { companyId: user.companyId, deploymentId: deployment.id }, kitNumber);
    await tx.personalKit.update({ where: { id: kit.id }, data: { pakalId } });
  });
  refresh();
  return { ok: true, message: pakalId ? 'הערכה סומנה כתיק פק"ל' : 'סימון הפק"ל הוסר' };
}

// ───────────── Swap kit numbers ─────────────

/**
 * Swap two kits' numbers in the active deployment (e.g. bag 2 ⇄ bag 36). Everything on a kit moves
 * with it — soldier, checklist, signature, פק"ל, contents check, returns and inspections — only the
 * numbers change places. Admin only. Closed deployments keep their own numbers.
 */
export async function swapKitNumbers(kitNumber: number, otherNumber: number): Promise<KitResult> {
  const w = await writableContext({ admin: true });
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  if (!Number.isInteger(otherNumber) || otherNumber === kitNumber) return { ok: false, message: "יש לבחור מספר תיק אחר" };
  const ids = { companyId: user.companyId, deploymentId: deployment.id };
  if (!(await validKitNumber(db, user.companyId, otherNumber))) return { ok: false, message: "מספר התיק מחוץ לטווח הערכות של הפלוגה" };
  await db.$transaction(async (tx) => {
    const [a, b] = [await ensureKit(tx, ids, kitNumber), await ensureKit(tx, ids, otherNumber)];
    // (deploymentId, kitNumber) is unique: park one kit on a number no kit uses, then swap.
    await tx.personalKit.update({ where: { id: a.id }, data: { kitNumber: -kitNumber } });
    await tx.personalKit.update({ where: { id: b.id }, data: { kitNumber } });
    await tx.personalKit.update({ where: { id: a.id }, data: { kitNumber: otherNumber } });
  });
  refresh();
  return { ok: true, message: `תיק ${kitNumber} ותיק ${otherNumber} החליפו מספרים` };
}
