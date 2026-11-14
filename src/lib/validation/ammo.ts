import { z } from "zod";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const MAX_AMMO_QUANTITY = 10_000_000;

const quantity = z.coerce
  .number({ error: "יש להזין מספר" })
  .int("יש להזין מספר שלם")
  .min(0, "הכמות לא יכולה להיות שלילית")
  .max(MAX_AMMO_QUANTITY, "הכמות גדולה מדי");

/** Locations are free text; normalize whitespace so "בונקר  פלוגתי" == "בונקר פלוגתי". */
export const LocationSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(2, "יש להזין מיקום").max(40, "שם המיקום ארוך מדי"));

export const AddStockSchema = z.object({
  categoryId: z.string().min(1, "יש לבחור סוג תחמושת"),
  location: LocationSchema,
  quantity: z.preprocess((v) => (v === "" ? 0 : v), quantity),
  note: z.preprocess(emptyToUndef, z.string().trim().max(200, "ההערה ארוכה מדי").optional()),
});

export const MovementSchema = z
  .object({
    type: z.enum(["COUNT", "RECEIVE", "ISSUE"], { error: "פעולה לא תקינה" }),
    amount: z.preprocess(emptyToUndef, quantity.optional()),
    note: z.preprocess(emptyToUndef, z.string().trim().max(200, "ההערה ארוכה מדי").optional()),
  })
  .superRefine((d, ctx) => {
    if (d.amount === undefined) ctx.addIssue({ code: "custom", path: ["amount"], message: "יש להזין כמות" });
    else if (d.type !== "COUNT" && d.amount === 0) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "הכמות חייבת להיות גדולה מ-0" });
    }
  });
