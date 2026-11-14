import type {
  AmmoCategory,
  CatalogDomain,
  EquipmentStatus,
  Platoon,
  Role,
  StorageStatus,
} from "@/generated/prisma/enums";

/** Hebrew labels for every enum. UI must never render raw enum values. */

export const PLATOONS: Platoon[] = ["PLATOON_1", "PLATOON_2", "PLATOON_3", "HQ"];

export const PLATOON_LABELS: Record<Platoon, string> = {
  PLATOON_1: "מחלקה 1",
  PLATOON_2: "מחלקה 2",
  PLATOON_3: "מחלקה 3",
  HQ: 'חפ"ק ומפל"ג',
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'מנהל (מ"פ / סמ"פ)',
  REGULAR: 'משתמש (רס"פ / מ"מ)',
};

export const CATALOG_DOMAIN_LABELS: Record<CatalogDomain, string> = {
  EQUIPMENT: 'צל"ם',
  AMMUNITION: "תחמושת",
  STORAGE: 'ציוד בימ"ח',
};

export const EQUIPMENT_STATUSES: EquipmentStatus[] = [
  "IN_ARMORY",
  "WITH_SOLDIER",
  "IN_REPAIR",
  "STORED",
  "MISSING",
];

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  IN_ARMORY: "בנשקייה",
  WITH_SOLDIER: "אצל לוחם",
  IN_REPAIR: "בתיקון",
  STORED: "מאופסן",
  MISSING: "חסר",
};

export const AMMO_CATEGORY_LABELS: Record<AmmoCategory, string> = {
  EXPLOSIVE: "נפיצה",
  NON_LETHAL: 'אלפ"ה',
  STANDARD: "רגילה",
};

export const STORAGE_STATUS_LABELS: Record<StorageStatus, string> = {
  OK: "תקין",
  SHORTAGE: "חוסר",
  DAMAGED: "בלאי",
  EXPIRED: "פג תוקף",
};

/** Business rules */
export const TOTAL_KITS = 98;
export const VERIFICATION_STALE_DAYS = 7;
export const EXPIRY_WARNING_DAYS = 30;

/**
 * Platoon colors (same scheme as the company's old Excel report: 1 = pink, 2 = blue, 3 = green).
 * Full class strings so Tailwind can see them at build time.
 */
export const PLATOON_BADGE_CLASSES: Record<Platoon, string> = {
  PLATOON_1: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
  PLATOON_2: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  PLATOON_3: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  HQ: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

export const PLATOON_DOT_CLASSES: Record<Platoon, string> = {
  PLATOON_1: "bg-rose-500",
  PLATOON_2: "bg-sky-500",
  PLATOON_3: "bg-emerald-500",
  HQ: "bg-amber-500",
};
