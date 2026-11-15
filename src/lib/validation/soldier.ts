import { z } from "zod";

// Shared (client + server) validation for roster records. All messages are Hebrew.

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Strips spaces/dashes; accepts 050-1234567, +972501234567, 0501234567. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, "");
  return digits.startsWith("+972") ? `0${digits.slice(4)}` : digits;
}

export const SoldierSchema = z.object({
  name: z.string().trim().min(2, "יש להזין שם מלא").max(80, "השם ארוך מדי"),
  personalNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^\d{5,9}$/.test(v), "מספר אישי חייב להכיל 5–9 ספרות"),
  phone: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? normalizePhone(v) : undefined))
    .refine((v) => v === undefined || /^0\d{8,9}$/.test(v), "מספר טלפון לא תקין"),
  /** A platoon id; that it belongs to the company is checked by the action. */
  platoon: z.string({ error: "יש לבחור מחלקה" }).trim().min(1, "יש לבחור מחלקה").max(64, "מחלקה לא תקינה"),
  position: optionalText(40, "התפקיד ארוך מדי"),
});

export type SoldierInput = z.output<typeof SoldierSchema>;

export type SoldierFieldErrors = Partial<Record<keyof SoldierInput, string>>;

export function fieldErrors(error: z.ZodError): SoldierFieldErrors {
  const out: SoldierFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof SoldierInput;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}
