-- Editable personal-kit checklist. The 16 fixed boolean columns on PersonalKit become rows:
-- KitItemDef (each company's checklist lines) and KitItemStatus (each kit's state per line).
-- Every company gets the 16 current items; every kit keeps exactly what it had; past inspections
-- store item names instead of code keys.
--
-- Prisma applies migration statements one by one (no implicit transaction). This one moves data,
-- so it runs as ONE explicit transaction: all or nothing. (The temp table lives for exactly that.)

BEGIN;

-- ── Company setting: new kits start all present / all missing ──
ALTER TABLE "Company" ADD COLUMN "kitDefaultPresent" BOOLEAN NOT NULL DEFAULT false;

-- ── Tables ──
CREATE TABLE "KitItemDef" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "targetQuantity" INTEGER,
    "systemKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitItemDef_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KitItemDef_target_positive" CHECK ("targetQuantity" IS NULL OR "targetQuantity" > 0)
);

CREATE TABLE "KitItemStatus" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitItemStatus_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "KitItemStatus_quantity_not_negative" CHECK ("quantity" IS NULL OR "quantity" >= 0)
);

-- ── The current checklist, for every company ──
CREATE TEMP TABLE "_kit_items" ("key" TEXT, "label" TEXT, "groupName" TEXT, "sortOrder" INT, "systemKey" TEXT) ON COMMIT DROP;
INSERT INTO "_kit_items" VALUES
  ('weaponIssued',    'נשק אישי',          'נשק אישי',         10,  'WEAPON'),
  ('cleaningKit',     'ערכת ניקוי',         'כלי ניקוי ונשק',   20,  NULL),
  ('weaponSling',     'רצועת נשק',          'כלי ניקוי ונשק',   30,  NULL),
  ('weaponOil',       'שמן נשק',            'כלי ניקוי ונשק',   40,  NULL),
  ('uniform1',        'מדים (סט 1)',        'ציוד אישי ללוחם',  50,  NULL),
  ('uniform2',        'מדים (סט 2)',        'ציוד אישי ללוחם',  60,  NULL),
  ('workBelt',        'חגור עבודה',         'ציוד אישי ללוחם',  70,  NULL),
  ('sleepingBag',     'שק שינה',            'ציוד אישי ללוחם',  80,  NULL),
  ('tacticalEyewear', 'משקפי מגן',          'ציוד אישי ללוחם',  90,  NULL),
  ('kneePads',        'מגני ברכיים',        'ציוד אישי ללוחם',  100, NULL),
  ('gearBag90L',      'תיק ציוד 90 ליטר',   'ציוד אישי ללוחם',  110, NULL),
  ('tacticalVest',    'וסט קרבי',           'ציוד אישי ללוחם',  120, NULL),
  ('ceramicPlates',   'פלטות קרמיות',       'ציוד אישי ללוחם',  130, NULL),
  ('helmet',          'קסדה',               'ציוד אישי ללוחם',  140, NULL),
  ('catTourniquet',   'חסם עורקים CAT',     'ציוד אישי ללוחם',  150, NULL),
  ('headlamp',        'פנס ראש',            'ציוד אישי ללוחם',  160, NULL);

INSERT INTO "KitItemDef" ("id", "companyId", "label", "groupName", "sortOrder", "systemKey", "updatedAt")
SELECT 'kitdef_' || c."id" || '_' || i."key", c."id", i."label", i."groupName", i."sortOrder", i."systemKey", CURRENT_TIMESTAMP
FROM "Company" c CROSS JOIN "_kit_items" i;

-- ── Every existing kit keeps its checklist ──
INSERT INTO "KitItemStatus" ("id", "companyId", "kitId", "itemId", "present", "updatedAt")
SELECT 'kitst_' || k."id" || '_' || i."key", k."companyId", k."id", 'kitdef_' || k."companyId" || '_' || i."key",
  CASE i."key"
    WHEN 'weaponIssued'    THEN k."weaponIssued"
    WHEN 'cleaningKit'     THEN k."cleaningKit"
    WHEN 'weaponSling'     THEN k."weaponSling"
    WHEN 'weaponOil'       THEN k."weaponOil"
    WHEN 'uniform1'        THEN k."uniform1"
    WHEN 'uniform2'        THEN k."uniform2"
    WHEN 'workBelt'        THEN k."workBelt"
    WHEN 'sleepingBag'     THEN k."sleepingBag"
    WHEN 'tacticalEyewear' THEN k."tacticalEyewear"
    WHEN 'kneePads'        THEN k."kneePads"
    WHEN 'gearBag90L'      THEN k."gearBag90L"
    WHEN 'tacticalVest'    THEN k."tacticalVest"
    WHEN 'ceramicPlates'   THEN k."ceramicPlates"
    WHEN 'helmet'          THEN k."helmet"
    WHEN 'catTourniquet'   THEN k."catTourniquet"
    WHEN 'headlamp'        THEN k."headlamp"
  END,
  CURRENT_TIMESTAMP
FROM "PersonalKit" k CROSS JOIN "_kit_items" i;

-- ── Past inspections: code keys → the item names ──
UPDATE "KitInspection" ins
SET "missingItems" = ARRAY(
  SELECT COALESCE(i."label", m)
  FROM unnest(ins."missingItems") WITH ORDINALITY AS u(m, ord)
  LEFT JOIN "_kit_items" i ON i."key" = u.m
  ORDER BY u.ord
);

-- ── The fixed columns go ──
ALTER TABLE "PersonalKit"
  DROP COLUMN "weaponIssued",
  DROP COLUMN "cleaningKit",
  DROP COLUMN "weaponSling",
  DROP COLUMN "weaponOil",
  DROP COLUMN "uniform1",
  DROP COLUMN "uniform2",
  DROP COLUMN "workBelt",
  DROP COLUMN "sleepingBag",
  DROP COLUMN "tacticalEyewear",
  DROP COLUMN "kneePads",
  DROP COLUMN "gearBag90L",
  DROP COLUMN "tacticalVest",
  DROP COLUMN "ceramicPlates",
  DROP COLUMN "helmet",
  DROP COLUMN "catTourniquet",
  DROP COLUMN "headlamp";

-- ── Indexes and keys ──
CREATE INDEX "KitItemDef_companyId_isActive_sortOrder_idx" ON "KitItemDef"("companyId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "KitItemDef_companyId_systemKey_key" ON "KitItemDef"("companyId", "systemKey");
CREATE INDEX "KitItemStatus_itemId_idx" ON "KitItemStatus"("itemId");
CREATE INDEX "KitItemStatus_companyId_idx" ON "KitItemStatus"("companyId");
CREATE UNIQUE INDEX "KitItemStatus_kitId_itemId_key" ON "KitItemStatus"("kitId", "itemId");

ALTER TABLE "KitItemDef" ADD CONSTRAINT "KitItemDef_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitItemStatus" ADD CONSTRAINT "KitItemStatus_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitItemStatus" ADD CONSTRAINT "KitItemStatus_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "PersonalKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KitItemStatus" ADD CONSTRAINT "KitItemStatus_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "KitItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
