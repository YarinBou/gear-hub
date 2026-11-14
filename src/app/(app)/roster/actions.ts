"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import type { Platoon } from "@/generated/prisma/enums";
import { companyContext } from "@/lib/context";
import { scopedDb } from "@/lib/db";
import { PLATOONS } from "@/lib/constants";
import { soldiersTag } from "@/lib/queries/soldiers";
import { MAX_IMPORT_ROWS, parseRosterText } from "@/lib/roster-import";
import { fieldErrors, SoldierSchema, type SoldierFieldErrors } from "@/lib/validation/soldier";

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

export async function createSoldier(_prev: SoldierFormState, formData: FormData): Promise<SoldierFormState> {
  const { user, db } = await companyContext();
  const values = readForm(formData);
  const parsed = SoldierSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  let id: string;
  try {
    const soldier = await db.soldier.create({
      data: { ...parsed.data, platoon: parsed.data.platoon as Platoon, companyId: user.companyId },
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
  const { user } = await companyContext();
  const values = readForm(formData);
  const parsed = SoldierSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const platoon = parsed.data.platoon as Platoon;

  try {
    // Company-level client: the platoon sync below targets the ACTIVE deployment, whichever one is viewed.
    await scopedDb(user.companyId).$transaction(async (tx) => {
      const before = await tx.soldier.findUniqueOrThrow({ where: { id }, select: { platoon: true } });
      await tx.soldier.update({
        where: { id },
        data: {
          name: parsed.data.name,
          platoon,
          personalNumber: parsed.data.personalNumber ?? null,
          phone: parsed.data.phone ?? null,
          position: parsed.data.position ?? null,
        },
      });
      // Equipment platoon is auto-filled from the holder — keep it in sync on transfer
      // (in the active deployment; closed deployments are history).
      if (before.platoon !== platoon) {
        await tx.equipmentAssignment.updateMany({
          where: { soldierId: id, deployment: { status: "ACTIVE" } },
          data: { platoon },
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
  const defaultPlatoon = (PLATOONS as string[]).includes(defaultRaw) ? (defaultRaw as Platoon) : null;

  // Never trust the client preview — parse and validate again here.
  const rows = parseRosterText(text, defaultPlatoon);
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
    data: toCreate.map((r) => ({ ...r.data, platoon: r.data.platoon as Platoon, companyId: user.companyId })),
    skipDuplicates: true,
  });
  if (count) updateTag(soldiersTag(user.companyId));

  skipped.sort((a, b) => a.line - b.line);
  return { created: count, skipped };
}
