"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { TOTAL_KITS } from "@/lib/constants";
import { AssignmentError, applyAssignment } from "@/lib/equipment-service";
import { KIT_ITEM_KEYS, kitChecklistSelect, type KitBooleanKey } from "@/lib/kit";
import { prisma } from "@/lib/prisma";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/equipment";

export type KitFormState = { ok?: boolean; message?: string; error?: string; errors?: FieldErrors; at?: number } | undefined;
export type KitResult = { ok: boolean; message?: string };

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

function validKitNumber(n: number) {
  return Number.isInteger(n) && n >= 1 && n <= TOTAL_KITS;
}

/** Kits 1–98 are seeded, but create the row lazily if it's missing. */
async function ensureKit(kitNumber: number) {
  if (!validKitNumber(kitNumber)) throw new Error("Invalid kit number");
  return prisma.personalKit.upsert({ where: { kitNumber }, update: {}, create: { kitNumber } });
}

// ───────────── Assignment to a soldier ─────────────

export async function assignKit(kitNumber: number, _prev: KitFormState, fd: FormData): Promise<KitFormState> {
  await requireUser();
  const kit = await ensureKit(kitNumber);
  const soldierId = String(fd.get("soldierId") ?? "") || null;
  if (soldierId === kit.soldierId) return { ok: true, message: "לא בוצע שינוי", at: Date.now() };

  if (soldierId) {
    const soldier = await prisma.soldier.findFirst({ where: { id: soldierId, isActive: true }, select: { id: true } });
    if (!soldier) return { error: "הלוחם לא נמצא בסד\"כ" };
    const other = await prisma.personalKit.findFirst({ where: { soldierId }, select: { kitNumber: true } });
    if (other) return { error: `ללוחם כבר מונפקת ערכה ${other.kitNumber}` };
  }

  try {
    await prisma.personalKit.update({
      where: { kitNumber },
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
  const user = await requireUser();
  const kit = await ensureKit(kitNumber);
  const parsed = WeaponSchema.safeParse({
    rifleType: fd.get("rifleType") ?? "",
    personalWeaponId: fd.get("personalWeaponId") ?? "",
    magazineCount: fd.get("magazineCount") ?? "",
    ammoCount: fd.get("ammoCount") ?? "",
  });
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) };
  const { rifleType, personalWeaponId, magazineCount, ammoCount } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      let typeFromItem: string | undefined;
      if (personalWeaponId && personalWeaponId !== kit.personalWeaponId) {
        if (!kit.soldierId) throw new AssignmentError("יש לשייך את הערכה ללוחם לפני קישור נשק");
        const item = await tx.equipmentItem.findUnique({
          where: { id: personalWeaponId },
          select: {
            assignedSoldierId: true,
            assignedSoldier: { select: { name: true } },
            category: { select: { name: true } },
            personalKit: { select: { kitNumber: true } },
          },
        });
        if (!item) throw new AssignmentError("הפריט לא נמצא");
        if (item.personalKit) throw new AssignmentError(`הנשק כבר רשום בערכה ${item.personalKit.kitNumber}`);
        if (item.assignedSoldierId && item.assignedSoldierId !== kit.soldierId) {
          throw new AssignmentError(`הנשק משויך ל${item.assignedSoldier?.name ?? "לוחם אחר"}`);
        }
        // Hand the rifle to the soldier through the shared equipment rule (status, platoon, history log).
        if (!item.assignedSoldierId) {
          await applyAssignment(
            tx,
            personalWeaponId,
            { soldierId: kit.soldierId, note: `נשק אישי — ערכה ${kitNumber}` },
            user.id,
          );
        }
        typeFromItem = item.category.name;
      }
      await tx.personalKit.update({
        where: { kitNumber },
        data: {
          personalWeaponId: personalWeaponId ?? null,
          rifleType: rifleType ?? typeFromItem ?? null,
          magazineCount,
          ammoCount,
          // Linking a rifle means the weapon line on the form is fulfilled.
          ...(personalWeaponId ? { weaponIssued: true } : {}),
        },
      });
    });
  } catch (e) {
    if (e instanceof AssignmentError) return { error: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "פרטי הנשק נשמרו", at: Date.now() };
}

// ───────────── Checklist / inspection ─────────────

const KeySchema = z.enum(KIT_ITEM_KEYS as [KitBooleanKey, ...KitBooleanKey[]]);

/** Single quick toggle (present / missing). */
export async function setKitItem(kitNumber: number, key: string, present: boolean): Promise<KitResult> {
  await requireUser();
  const parsedKey = KeySchema.safeParse(key);
  if (!parsedKey.success || typeof present !== "boolean") return { ok: false, message: "פריט לא תקין" };
  await ensureKit(kitNumber);
  await prisma.personalKit.update({ where: { kitNumber }, data: { [parsedKey.data]: present } });
  refresh();
  return { ok: true };
}

/** "הכל קיים" — mark every checklist item present. */
export async function setAllKitItems(kitNumber: number, present: boolean): Promise<KitResult> {
  await requireUser();
  await ensureKit(kitNumber);
  await prisma.personalKit.update({
    where: { kitNumber },
    data: Object.fromEntries(KIT_ITEM_KEYS.map((k) => [k, present])),
  });
  refresh();
  return { ok: true };
}

/** Close a מסדר: snapshot what's missing right now. */
export async function completeInspection(kitNumber: number, note: string): Promise<KitResult> {
  const user = await requireUser();
  const kit = await prisma.personalKit.findUnique({
    where: { kitNumber },
    select: { id: true, soldierId: true, ...kitChecklistSelect },
  });
  if (!kit) return { ok: false, message: "הערכה לא נמצאה" };
  if (!kit.soldierId) return { ok: false, message: "לא ניתן לבצע מסדר לערכה שלא הונפקה" };
  const missing = KIT_ITEM_KEYS.filter((k) => !kit[k]);
  const cleanNote = note.trim().slice(0, 300) || null;

  await prisma.$transaction([
    prisma.kitInspection.create({
      data: { kitId: kit.id, missingItems: missing, note: cleanNote, performedById: user.id },
    }),
    prisma.personalKit.update({ where: { kitNumber }, data: { lastInspectedAt: new Date() } }),
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
  const user = await requireUser();
  if (
    typeof signatureData !== "string" ||
    !signatureData.startsWith("data:image/png;base64,") ||
    signatureData.length > MAX_SIGNATURE_BYTES
  ) {
    return { ok: false, message: "חתימה לא תקינה" };
  }
  const kit = await prisma.personalKit.findUnique({ where: { kitNumber }, select: { soldierId: true } });
  if (!kit?.soldierId) return { ok: false, message: "יש לשייך את הערכה ללוחם לפני החתמה" };
  await prisma.personalKit.update({
    where: { kitNumber },
    data: { signatureData, signedAt: new Date(), signedById: user.id },
  });
  refresh();
  return { ok: true, message: "הלוחם הוחתם על הערכה" };
}

export async function clearSignature(kitNumber: number): Promise<KitResult> {
  await requireUser();
  await prisma.personalKit.update({
    where: { kitNumber },
    data: { signatureData: null, signedAt: null, signedById: null },
  });
  refresh();
  return { ok: true };
}
