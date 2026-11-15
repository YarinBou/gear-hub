import type {
  AmmoCategory,
  CatalogDomain,
  EquipmentStatus,
  Role,
  StorageStatus,
} from "@/generated/prisma/enums";

/** Hebrew labels for every enum. UI must never render raw enum values. */

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "מנהל מערכת",
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


