import { z } from "zod";
import { EQUIPMENT_STATUSES, PLATOONS } from "@/lib/constants";
import { normalizeSerial } from "@/lib/equipment-rules";

const status = z.enum(EQUIPMENT_STATUSES as [string, ...string[]], { error: "סטטוס לא תקין" });
const platoon = z.enum(PLATOONS as [string, ...string[]], { error: "מחלקה לא תקינה" });
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const SerialSchema = z
  .string()
  .transform(normalizeSerial)
  .pipe(
    z
      .string()
      .min(2, 'מספר צ / מס"ט קצר מדי')
      .max(40, 'מספר צ / מס"ט ארוך מדי')
      .regex(/^[0-9A-Z\-/.]+$/, 'מספר צ / מס"ט יכול להכיל ספרות, אותיות לועזיות, מקף, נקודה ולוכסן'),
  );

export const MAX_BATCH_SERIALS = 200;

/** One serial per line (or comma-separated), for batch creation. */
export const SerialListSchema = z
  .string()
  .transform((s) =>
    s
      .split(/[\r\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(SerialSchema)
      .min(1, 'יש להזין לפחות מספר צ / מס"ט אחד')
      .max(MAX_BATCH_SERIALS, `ניתן להוסיף עד ${MAX_BATCH_SERIALS} פריטים בכל פעם`),
  );

/** How many "ללא צ" items to create when serials aren't known yet. */
export const NoSerialQuantitySchema = z.coerce
  .number({ error: "יש להזין כמות" })
  .int("יש להזין מספר שלם")
  .min(1, "הכמות חייבת להיות לפחות 1")
  .max(MAX_BATCH_SERIALS, `ניתן להוסיף עד ${MAX_BATCH_SERIALS} פריטים בכל פעם`);

/** Everything except the serials / quantity, which depend on the "ללא צ" switch. */
export const CreateEquipmentSchema = z.object({
  categoryId: z.string().min(1, "יש לבחור סוג פריט"),
  noSerial: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  status: z.preprocess(emptyToUndef, status.optional()),
  soldierId: z.preprocess(emptyToUndef, z.string().optional()),
  platoon: z.preprocess(emptyToUndef, platoon.optional()),
  notes: z.preprocess(emptyToUndef, z.string().trim().max(500, "ההערה ארוכה מדי").optional()),
});

export const UpdateDetailsSchema = z.object({
  categoryId: z.string().min(1, "יש לבחור סוג פריט"),
  /** Empty = "ללא צ" (not recorded yet). */
  serialNumber: z.preprocess(emptyToUndef, SerialSchema.optional()),
  notes: z.preprocess(emptyToUndef, z.string().trim().max(500, "ההערה ארוכה מדי").optional()),
});

export const AssignSchema = z.object({
  soldierId: z.preprocess(emptyToUndef, z.string().optional()),
  status: z.preprocess(emptyToUndef, status.optional()),
  platoon: z.preprocess(emptyToUndef, platoon.optional()),
  note: z.preprocess(emptyToUndef, z.string().trim().max(300, "ההערה ארוכה מדי").optional()),
  verify: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export type FieldErrors = Record<string, string>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
