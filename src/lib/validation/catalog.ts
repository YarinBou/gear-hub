import { z } from "zod";
import type { AmmoCategory, CatalogDomain } from "@/generated/prisma/enums";

const AMMO_CATEGORIES = ["EXPLOSIVE", "NON_LETHAL", "STANDARD"] as const satisfies readonly AmmoCategory[];
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/**
 * Validates a catalog type for its domain and strips fields that don't belong to it.
 * Built per domain so every field error is reported in one pass.
 */
export function parseCategory(domain: CatalogDomain, input: Record<string, unknown>) {
  const ammo = domain === "AMMUNITION";
  const schema = z
    .object({
      name: z.string().trim().min(2, "יש להזין שם (לפחות 2 תווים)").max(60, "השם ארוך מדי"),
      description: z.preprocess(emptyToUndef, z.string().trim().max(200, "התיאור ארוך מדי").optional()),
      ammoCategory: ammo
        ? z.preprocess(emptyToUndef, z.enum(AMMO_CATEGORIES, { error: "יש לבחור קטגוריית תחמושת" }))
        : z.unknown().transform(() => undefined),
      minThreshold: z.preprocess(
        emptyToUndef,
        z.coerce
          .number({ error: "יש להזין מספר" })
          .int("יש להזין מספר שלם")
          .min(0, "הסף לא יכול להיות שלילי")
          .max(10_000_000, "המספר גדול מדי")
          .optional(),
      ),
      requiresExpiry: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
    })
    .transform((d) => ({
      name: d.name,
      description: d.description ?? null,
      ammoCategory: ammo ? ((d.ammoCategory as AmmoCategory | undefined) ?? null) : null,
      minThreshold: ammo ? (d.minThreshold ?? null) : null,
      requiresExpiry: domain === "STORAGE" ? d.requiresExpiry : false,
    }));
  return schema.safeParse(input);
}
