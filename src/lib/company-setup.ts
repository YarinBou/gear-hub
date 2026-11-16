import type { Prisma } from "../generated/prisma/client";
import type { AmmoCategory } from "../generated/prisma/enums";
import { DEFAULT_KIT_ITEMS } from "./kit";
import { DEFAULT_PLATOONS } from "./platoons";

// What a brand-new company starts with: a default catalog (editable afterwards on /catalog), its
// storage lines (תקן / מצאי), its platoons (editable on /platoons) and the personal-kit checklist (editable on /kits/items). No deployment — kits 1..kitCount are created when the company starts
// its first deployment. Idempotent — safe to run again.
// Shared by the super-admin "create company" action and prisma/seed.ts, so it uses relative
// imports only (the seed runs outside Next.js).

export const DEFAULT_EQUIPMENT_TYPES = [
  "M16",
  "M4",
  "מאג",
  "נגב",
  "מטול רימונים",
  "כוונת M5",
  "כוונת טריג'יקון",
  "משקפת",
  'אמר"ל (ראיית לילה)',
  "רחפן",
  "מכשיר קשר",
];

export const DEFAULT_AMMO_TYPES: { name: string; ammoCategory: AmmoCategory; minThreshold: number }[] = [
  { name: '5.56 מ"מ רגיל', ammoCategory: "STANDARD", minThreshold: 10000 },
  { name: '5.56 מ"מ נותב', ammoCategory: "STANDARD", minThreshold: 2000 },
  { name: '7.62 מ"מ שרשרת', ammoCategory: "STANDARD", minThreshold: 3000 },
  { name: "רימון רסס", ammoCategory: "EXPLOSIVE", minThreshold: 50 },
  { name: 'רימון 40 מ"מ', ammoCategory: "EXPLOSIVE", minThreshold: 60 },
  { name: "רימון הלם", ammoCategory: "NON_LETHAL", minThreshold: 30 },
  { name: "רימון גז", ammoCategory: "NON_LETHAL", minThreshold: 30 },
];

export const DEFAULT_STORAGE_TYPES: { name: string; requiresExpiry?: boolean; target: number }[] = [
  { name: "רשת הסוואה", target: 12 },
  { name: "חסם עורקים", requiresExpiry: true, target: 120 },
  { name: "ערכת עזרה ראשונה", requiresExpiry: true, target: 20 },
  { name: "מנשא מים (קמל)", target: 100 },
  { name: "ציוד גשם", target: 100 },
  { name: "כיסוי קסדה", target: 100 },
];

type Tx = Prisma.TransactionClient;

/**
 * Give a company its default catalog, storage lines and kit checklist. Skips anything that exists.
 * `defaults: false` (company created from another company's setup): only platoons — the catalog
 * and kit checklist come from the template instead (see src/lib/company-template.ts).
 */
export async function provisionCompany(tx: Tx, companyId: string, { defaults = true }: { defaults?: boolean } = {}) {
  if (!(await tx.platoon.count({ where: { companyId } }))) {
    await tx.platoon.createMany({
      data: DEFAULT_PLATOONS.map((name, i) => ({ companyId, name, sortOrder: (i + 1) * 10, color: i })),
    });
  }
  if (!defaults) return;

  await tx.equipmentCategory.createMany({
    data: [
      ...DEFAULT_EQUIPMENT_TYPES.map((name) => ({ companyId, domain: "EQUIPMENT" as const, name })),
      ...DEFAULT_AMMO_TYPES.map((a) => ({ companyId, domain: "AMMUNITION" as const, ...a })),
      ...DEFAULT_STORAGE_TYPES.map((s) => ({
        companyId,
        domain: "STORAGE" as const,
        name: s.name,
        requiresExpiry: s.requiresExpiry ?? false,
      })),
    ],
    skipDuplicates: true,
  });

  // One storage line per storage type (תקן / מצאי).
  const storageTypes = await tx.equipmentCategory.findMany({
    where: { companyId, domain: "STORAGE", storageItems: { none: {} } },
    select: { id: true, name: true },
  });
  const targets = new Map(DEFAULT_STORAGE_TYPES.map((s) => [s.name, s.target]));
  if (storageTypes.length) {
    await tx.storageItem.createMany({
      data: storageTypes.map((c) => ({ companyId, categoryId: c.id, targetQuantity: targets.get(c.name) ?? 0 })),
    });
  }

  // Personal-kit checklist — only for a company that has none yet.
  if (!(await tx.kitItemDef.count({ where: { companyId } }))) {
    await tx.kitItemDef.createMany({
      data: DEFAULT_KIT_ITEMS.map((item, i) => ({ companyId, sortOrder: (i + 1) * 10, ...item })),
    });
  }
}
