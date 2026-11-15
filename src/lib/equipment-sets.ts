import { z } from "zod";

// Equipment sets (מארזים) — pure rules shared by the admin screen, the sign-out form, the item
// page and the list. A set is a main item type plus component lines (type × quantity), each either
// required or an optional add-on (תוספת). Completeness is soft: missing lines are flagged, never blocked.

export type SetSlotDef = { categoryId: string; category: { name: string }; quantity: number; required: boolean };

export type SetLine = SetSlotDef & { have: number; missing: number };

export type SetStatus = {
  lines: SetLine[];
  /** Missing pieces across required lines. */
  missing: number;
  /** Components whose type isn't one of the set's lines (ad-hoc additions). */
  extras: number;
  complete: boolean;
};

/** Compare a main item's actual components with its set's lines. */
export function setStatus(slots: SetSlotDef[], components: { categoryId: string }[]): SetStatus {
  const counts = new Map<string, number>();
  for (const c of components) counts.set(c.categoryId, (counts.get(c.categoryId) ?? 0) + 1);
  const lines = slots.map((s) => {
    const have = counts.get(s.categoryId) ?? 0;
    return { ...s, have, missing: s.required ? Math.max(0, s.quantity - have) : 0 };
  });
  const slotTypes = new Set(slots.map((s) => s.categoryId));
  const missing = lines.reduce((n, l) => n + l.missing, 0);
  return { lines, missing, extras: components.filter((c) => !slotTypes.has(c.categoryId)).length, complete: missing === 0 };
}

/** "ציין, שח"ע ×2" — the missing required lines, for badges and warnings. */
export function missingSummary(status: SetStatus) {
  return status.lines
    .filter((l) => l.missing > 0)
    .map((l) => (l.missing > 1 ? `${l.category.name} ×${l.missing}` : l.category.name))
    .join(", ");
}

// ───────────── Admin form ─────────────

export const MAX_SET_SLOTS = 30;

export const SetSlotSchema = z.object({
  categoryId: z.string().min(1, "יש לבחור סוג"),
  quantity: z.coerce.number({ error: "כמות לא תקינה" }).int("מספר שלם").min(1, "לפחות 1").max(50, "לכל היותר 50"),
  required: z.boolean(),
});

export const SetSchema = z
  .object({
    name: z.string().trim().min(1, "יש להזין שם מארז").max(60, "השם ארוך מדי"),
    mainCategoryId: z.string().min(1, "יש לבחור פריט ראשי"),
    notes: z
      .string()
      .trim()
      .max(200, "ההערה ארוכה מדי")
      .optional()
      .transform((v) => v || undefined),
    slots: z.array(SetSlotSchema).min(1, "יש להוסיף לפחות רכיב אחד").max(MAX_SET_SLOTS, `לכל היותר ${MAX_SET_SLOTS} רכיבים`),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    for (const s of v.slots) {
      if (seen.has(s.categoryId)) {
        ctx.addIssue({ code: "custom", path: ["slots"], message: "אותו סוג מופיע פעמיים — עדיף להגדיל את הכמות" });
        return;
      }
      seen.add(s.categoryId);
    }
  });

export type SetInput = z.input<typeof SetSchema>;

// ───────────── Sign-out form ─────────────

/** Value of a sign-out line that creates a new component "ללא צ". */
export const NEW_NO_SERIAL = "__new__";

export const SignSetSchema = z.object({
  setId: z.string().min(1, "יש לבחור מארז"),
  soldierId: z.string().min(1, "יש לבחור לוחם"),
  mainItemId: z.string().min(1, "יש לבחור פריט ראשי"),
  /** Existing items to attach as components. */
  componentIds: z.array(z.string().min(1)).max(100),
  /** Component types to create "ללא צ" (one entry per piece). */
  newComponentCategoryIds: z.array(z.string().min(1)).max(100),
  note: z
    .string()
    .trim()
    .max(200, "ההערה ארוכה מדי")
    .optional()
    .transform((v) => v || undefined),
});

export type SignSetInput = z.input<typeof SignSetSchema>;
