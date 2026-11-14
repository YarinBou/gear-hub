import type { PersonalKit } from "@/generated/prisma/client";

/**
 * Single source of truth for the sign-out form's checklist.
 * Keys must match boolean columns on PersonalKit (prisma/schema.prisma).
 */
export type KitBooleanKey = {
  [K in keyof PersonalKit]: PersonalKit[K] extends boolean ? K : never;
}[keyof PersonalKit];

export type KitGroup = "weapon" | "accessories" | "personal";

export const KIT_GROUP_LABELS: Record<KitGroup, string> = {
  weapon: "נשק אישי",
  accessories: "כלי ניקוי ונשק",
  personal: "ציוד אישי ללוחם",
};

export const KIT_ITEMS: { key: KitBooleanKey; label: string; group: KitGroup }[] = [
  { key: "weaponIssued", label: "נשק אישי", group: "weapon" },

  { key: "cleaningKit", label: "ערכת ניקוי", group: "accessories" },
  { key: "weaponSling", label: "רצועת נשק", group: "accessories" },
  { key: "weaponOil", label: "שמן נשק", group: "accessories" },

  { key: "uniform1", label: "מדים (סט 1)", group: "personal" },
  { key: "uniform2", label: "מדים (סט 2)", group: "personal" },
  { key: "workBelt", label: "חגור עבודה", group: "personal" },
  { key: "sleepingBag", label: "שק שינה", group: "personal" },
  { key: "tacticalEyewear", label: "משקפי מגן", group: "personal" },
  { key: "kneePads", label: "מגני ברכיים", group: "personal" },
  { key: "gearBag90L", label: "תיק ציוד 90 ליטר", group: "personal" },
  { key: "tacticalVest", label: "וסט קרבי", group: "personal" },
  { key: "ceramicPlates", label: "פלטות קרמיות", group: "personal" },
  { key: "helmet", label: "קסדה", group: "personal" },
  { key: "catTourniquet", label: "חסם עורקים CAT", group: "personal" },
  { key: "headlamp", label: "פנס ראש", group: "personal" },
];

export const KIT_ITEM_KEYS = KIT_ITEMS.map((i) => i.key);

/** Prisma `select` covering every checklist boolean. */
export const kitChecklistSelect = Object.fromEntries(KIT_ITEM_KEYS.map((k) => [k, true])) as Record<
  KitBooleanKey,
  true
>;

/** Readiness 0–100 for a kit, based on the checklist booleans. */
export function kitReadiness(kit: Pick<PersonalKit, KitBooleanKey>): number {
  const present = KIT_ITEM_KEYS.filter((k) => kit[k]).length;
  return Math.round((present / KIT_ITEM_KEYS.length) * 100);
}
