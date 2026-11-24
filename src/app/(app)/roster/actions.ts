"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { companyContext, writableContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { AssignmentError, applyAssignment } from "@/lib/equipment-service";
import { getActivePlatoons } from "@/lib/queries/platoons";
import { soldiersTag } from "@/lib/queries/soldiers";
import { MAX_IMPORT_ROWS, parseRosterText } from "@/lib/roster-import";
import { fieldErrors, SoldierSchema, type SoldierFieldErrors, type SoldierInput } from "@/lib/validation/soldier";

export type SoldierFormState =
  | {
      ok?: boolean;
      message?: string;
      errors?: SoldierFieldErrors;
      /** Echo of the submitted values so the form keeps them after a failed submit. */
      values?: Record<string, string>;
    }
  | undefined;

const FIELDS = ["name", "personalNumber", "phone", "platoon", "position"] as const;

function readForm(formData: FormData) {
  return Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "")])) as Record<
    (typeof FIELDS)[number],
    string
  >;
}

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

const DUPLICATE_PN: SoldierFieldErrors = { personalNumber: "מספר אישי זה כבר קיים בסד\"כ" };
const BAD_PLATOON: SoldierFieldErrors = { platoon: "יש לבחור מחלקה" };

/** The chosen platoon must be one of the company's active platoons (or the soldier's current one). */
async function platoonAllowed(platoonId: string, current?: string) {
  return platoonId === current || (await getActivePlatoons()).some((p) => p.id === platoonId);
}

/** Form fields → Soldier columns. */
function soldierData({ platoon, ...rest }: SoldierInput) {
  return { ...rest, platoonId: platoon };
}

export async function createSoldier(_prev: SoldierFormState, formData: FormData): Promise<SoldierFormState> {
  const { user, db } = await companyContext();
  const values = readForm(formData);
  const parsed = SoldierSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  if (!(await platoonAllowed(parsed.data.platoon))) return { errors: BAD_PLATOON, values };

  let id: string;
  try {
    const soldier = await db.soldier.create({
      data: { ...soldierData(parsed.data), companyId: user.companyId },
    });
    id = soldier.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: DUPLICATE_PN, values };
    throw e;
  }
  updateTag(soldiersTag(user.companyId));

  if (formData.get("intent") === "again") {
    // Keep the platoon selected for fast consecutive entry.
    return { ok: true, message: `${parsed.data.name} נוסף לסד"כ`, values: { platoon: values.platoon } };
  }
  redirect(`/roster/${id}`);
}

export async function updateSoldier(
  id: string,
  _prev: SoldierFormState,
  formData: FormData,
): Promise<SoldierFormState> {
  const { user, db } = await companyContext();
  const values = readForm(formData);
  const parsed = SoldierSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const platoonId = parsed.data.platoon;
  const current = await db.soldier.findUnique({ where: { id }, select: { platoonId: true } });
  if (!current) return { errors: { name: "הלוחם לא נמצא" }, values };
  if (!(await platoonAllowed(platoonId, current.platoonId))) return { errors: BAD_PLATOON, values };

  try {
    // Company-level client: the platoon sync below targets the ACTIVE deployment, whichever one is viewed.
    await scopedDb(user.companyId).$transaction(async (tx) => {
      const before = await tx.soldier.findUniqueOrThrow({ where: { id }, select: { platoonId: true } });
      await tx.soldier.update({
        where: { id },
        data: {
          name: parsed.data.name,
          platoonId,
          personalNumber: parsed.data.personalNumber ?? null,
          phone: parsed.data.phone ?? null,
          position: parsed.data.position ?? null,
        },
      });
      // Equipment platoon is auto-filled from the holder — keep it in sync on transfer
      // (in the active deployment; closed deployments are history).
      if (before.platoonId !== platoonId) {
        await tx.equipmentAssignment.updateMany({
          where: { soldierId: id, deployment: { status: "ACTIVE" } },
          data: { platoonId },
        });
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: DUPLICATE_PN, values };
    throw e;
  }
  updateTag(soldiersTag(user.companyId));
  return { ok: true, message: "הפרטים נשמרו", values };
}

export type ActiveState = { error?: string } | undefined;

/** Soft delete / restore. A soldier holding equipment or a kit in the active deployment cannot be removed. */
export async function setSoldierActive(
  id: string,
  active: boolean,
  _prev: ActiveState,
  _formData: FormData,
): Promise<ActiveState> {
  const { user, db } = await companyContext();
  if (!active) {
    const s = await db.soldier.findUnique({ where: { id }, select: { id: true } });
    if (!s) return { error: "הלוחם לא נמצא" };
    const companyDb = scopedDb(user.companyId);
    const inActive = { soldierId: id, deployment: { status: "ACTIVE" as const } };
    const [items, kit] = await Promise.all([
      companyDb.equipmentAssignment.count({ where: inActive }),
      companyDb.personalKit.findFirst({ where: inActive, select: { kitNumber: true } }),
    ]);
    const blockers: string[] = [];
    if (items) blockers.push(`${items} פריטי צל"ם`);
    if (kit) blockers.push(`ערכה ${kit.kitNumber}`);
    if (blockers.length) {
      return { error: `לא ניתן להוציא מהסד"כ לפני זיכוי: ${blockers.join(", ")}` };
    }
  }
  await db.soldier.update({ where: { id }, data: { isActive: active } });
  updateTag(soldiersTag(user.companyId));
  return undefined;
}

export type ImportState =
  | {
      created?: number;
      skipped?: { line: number; name: string; reason: string }[];
      error?: string;
    }
  | undefined;

export async function importSoldiers(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { user, db } = await companyContext();
  const text = String(formData.get("text") ?? "");
  const defaultRaw = String(formData.get("defaultPlatoon") ?? "");
  const platoons = await getActivePlatoons();
  const defaultPlatoon = platoons.some((p) => p.id === defaultRaw) ? defaultRaw : null;

  // Never trust the client preview — parse and validate again here.
  const rows = parseRosterText(text, defaultPlatoon, platoons);
  if (rows.length === 0) return { error: "לא נמצאו שורות לייבוא" };
  if (rows.length > MAX_IMPORT_ROWS) return { error: `ניתן לייבא עד ${MAX_IMPORT_ROWS} שורות בכל פעם` };

  const skipped: { line: number; name: string; reason: string }[] = [];
  const valid = rows.flatMap((r) => {
    if (r.ok) return [r];
    skipped.push({ line: r.line, name: r.raw, reason: r.error });
    return [];
  });

  const pns = valid.map((r) => r.data.personalNumber).filter((v): v is string => !!v);
  const existing = new Set(
    (
      await db.soldier.findMany({ where: { personalNumber: { in: pns } }, select: { personalNumber: true } })
    ).map((s) => s.personalNumber),
  );

  const toCreate = valid.filter((r) => {
    if (r.data.personalNumber && existing.has(r.data.personalNumber)) {
      skipped.push({ line: r.line, name: r.data.name, reason: "מספר אישי כבר קיים בסד\"כ" });
      return false;
    }
    return true;
  });

  const { count } = await db.soldier.createMany({
    data: toCreate.map((r) => ({ ...soldierData(r.data), companyId: user.companyId })),
    skipDuplicates: true,
  });
  if (count) updateTag(soldiersTag(user.companyId));

  skipped.sort((a, b) => a.line - b.line);
  return { created: count, skipped };
}

export type PresenceResult = { ok: boolean; message: string };

/**
 * Mark soldiers as in / not in the viewed deployment (it must be the active one). Someone holding
 * equipment or a kit in it can't be taken out — they're skipped and named in the message.
 */
export async function setPresence(soldierIds: string[], present: boolean): Promise<PresenceResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  const ids = Array.isArray(soldierIds) ? [...new Set(soldierIds.filter((x) => typeof x === "string"))].slice(0, 1000) : [];
  if (!ids.length || typeof present !== "boolean") return { ok: false, message: "לא נבחרו לוחמים" };

  // Only this company's soldiers (`db` is company-scoped).
  const soldiers = await db.soldier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  if (present) {
    const { count } = await db.deploymentAbsence.deleteMany({ where: { soldierId: { in: soldiers.map((s) => s.id) } } });
    refresh();
    return { ok: true, message: count ? `${count} לוחמים סומנו כמשתתפים בהפעלה` : "לא בוצע שינוי" };
  }

  const [holdingItems, holdingKits, holdingLoose] = await Promise.all([
    db.equipmentAssignment.findMany({ where: { soldierId: { in: soldiers.map((s) => s.id) } }, select: { soldierId: true } }),
    db.personalKit.findMany({ where: { soldierId: { in: soldiers.map((s) => s.id) } }, select: { soldierId: true } }),
    db.soldierItem.findMany({ where: { soldierId: { in: soldiers.map((s) => s.id) } }, select: { soldierId: true } }),
  ]);
  const holding = new Set([...holdingItems, ...holdingKits, ...holdingLoose].map((r) => r.soldierId));
  const eligible = soldiers.filter((s) => !holding.has(s.id));
  const { count } = await db.deploymentAbsence.createMany({
    data: eligible.map((s) => ({ companyId: user.companyId, deploymentId: deployment.id, soldierId: s.id })),
    skipDuplicates: true,
  });
  refresh();
  const blocked = soldiers.filter((s) => holding.has(s.id)).map((s) => s.name);
  const parts = [count ? `${count} לוחמים סומנו כלא משתתפים` : "לא בוצע שינוי"];
  if (blocked.length) parts.push(`דולגו (מחזיקים ציוד, ערכה או פריטים — יש לזכות קודם): ${blocked.slice(0, 8).join(", ")}${blocked.length > 8 ? "…" : ""}`);
  return { ok: true, message: parts.join(" · ") };
}

export type ReturnResult = { ok: boolean; message: string };

/**
 * זיכוי: take equipment back from a soldier (from their page). `itemIds` = the items to return, or
 * "all" for everything they hold. Returned items have no holder and become "מאופסן". Components of a
 * set aren't returned on their own — they follow their main item.
 */
export async function returnSoldierEquipment(soldierId: string, itemIds: string[] | "all"): Promise<ReturnResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  if (typeof soldierId !== "string" || !(itemIds === "all" || Array.isArray(itemIds))) {
    return { ok: false, message: "בחירה לא תקינה" };
  }
  const only = itemIds === "all" ? null : [...new Set(itemIds.filter((x) => typeof x === "string"))].slice(0, 500);
  if (only && !only.length) return { ok: false, message: "לא נבחרו פריטים" };

  // `db` is scoped to the company and the active deployment.
  const rows = await db.equipmentAssignment.findMany({
    where: { soldierId, item: { parentId: null }, ...(only ? { itemId: { in: only } } : {}) },
    select: { itemId: true },
  });
  if (!rows.length) return { ok: false, message: "אין פריטים לזיכוי" };

  const ctx = { companyId: user.companyId, deploymentId: deployment.id, userId: user.id };
  try {
    await db.$transaction(async (tx) => {
      for (const r of rows) {
        await applyAssignment(tx, ctx, r.itemId, { soldierId: null, status: "STORED", note: "זיכוי מהלוחם" });
      }
    });
  } catch (e) {
    if (e instanceof AssignmentError) return { ok: false, message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: rows.length === 1 ? "הפריט זוכה ואופסן" : `${rows.length} פריטים זוכו ואופסנו` };
}

// ───────────── Items outside the kit ─────────────

export type LooseResult = { ok: boolean; message: string };

/**
 * Hand a soldier a checklist item outside any kit (e.g. a thigh pouch on the move). From the
 * company's checklist only; recorded with who and when. The same item again adds to the quantity.
 */
export async function addSoldierItem(soldierId: string, itemId: string, quantity: number, note: string): Promise<LooseResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  if (typeof soldierId !== "string" || typeof itemId !== "string") return { ok: false, message: "בחירה לא תקינה" };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return { ok: false, message: "כמות: מספר שלם בין 1 ל-1,000" };
  const [soldier, item] = await Promise.all([
    db.soldier.findFirst({
      where: { id: soldierId, isActive: true, absences: { none: { deploymentId: deployment.id } } },
      select: { id: true },
    }),
    db.kitItemDef.findFirst({ where: { id: itemId, isActive: true, systemKey: null }, select: { id: true, label: true } }),
  ]);
  if (!soldier) return { ok: false, message: "הלוחם לא נמצא בהפעלה" };
  if (!item) return { ok: false, message: "יש לבחור פריט מרשימת הציוד" };
  const cleanNote = (typeof note === "string" ? note.trim().slice(0, 200) : "") || null;
  await db.soldierItem.upsert({
    where: { deploymentId_soldierId_itemId: { deploymentId: deployment.id, soldierId, itemId } },
    update: { quantity: { increment: quantity }, ...(cleanNote ? { note: cleanNote } : {}), issuedById: user.id },
    create: {
      companyId: user.companyId,
      deploymentId: deployment.id,
      soldierId,
      itemId,
      quantity,
      note: cleanNote,
      issuedById: user.id,
    },
  });
  refresh();
  return { ok: true, message: quantity === 1 ? `נרשם: ${item.label}` : `נרשם: ${item.label} × ${quantity}` };
}

/**
 * זיכוי of items held outside the kit: what came back per row (by row id), with notes on gaps.
 * Recorded in the soldier's return history; the rows are cleared (gaps are documented, not kept).
 */
export async function returnSoldierItems(
  soldierId: string,
  input: { returned: Record<string, number>; gapNotes?: Record<string, string>; note?: string },
): Promise<LooseResult> {
  const w = await writableContext();
  if (!w.ok) return { ok: false, message: w.message };
  const { user, db, deployment } = w;
  if (typeof soldierId !== "string" || !input || typeof input.returned !== "object") return { ok: false, message: "בקשה לא תקינה" };
  const ids = Object.keys(input.returned).slice(0, 200);
  const rows = await db.soldierItem.findMany({
    where: { soldierId, id: { in: ids } },
    orderBy: { item: { sortOrder: "asc" } },
    select: { id: true, quantity: true, item: { select: { label: true } } },
  });
  if (!rows.length) return { ok: false, message: "אין פריטים לזיכוי" };
  const notes = input.gapNotes && typeof input.gapNotes === "object" ? input.gapNotes : {};
  const lines = rows.map((r) => {
    const raw = Number(input.returned[r.id]);
    const back = Number.isInteger(raw) ? Math.min(Math.max(raw, 0), r.quantity) : 0;
    const gapNote = back < r.quantity && typeof notes[r.id] === "string" ? notes[r.id].trim().slice(0, 200) : "";
    return { label: r.item.label, expected: r.quantity, returned: back, ...(gapNote ? { note: gapNote } : {}) };
  });
  const gaps = lines.filter((l) => l.returned < l.expected).length;
  await db.$transaction([
    db.soldierItemReturn.create({
      data: {
        companyId: user.companyId,
        deploymentId: deployment.id,
        soldierId,
        lines,
        gapCount: gaps,
        note: (typeof input.note === "string" ? input.note.trim().slice(0, 300) : "") || null,
        performedById: user.id,
      },
    }),
    db.soldierItem.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } }),
  ]);
  refresh();
  const what = rows.length === 1 ? "הפריט זוכה" : `${rows.length} פריטים זוכו`;
  return { ok: true, message: gaps === 0 ? what : `${what} — ${gaps === 1 ? "פער אחד נרשם" : `${gaps} פערים נרשמו`}` };
}
