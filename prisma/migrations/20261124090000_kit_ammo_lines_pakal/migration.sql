-- 1. Magazines, rounds and extra ammo move from the weapon card into the kit checklist (group "תחמושת"),
--    so they are signed for, inspected, returned and kept in the kit's history like every other line.
-- 2. Optional checklist items (part of a kit only when signed for, or required by its פק"ל).
-- 3. פק"לים (role kits: נגביסט / מא"ג / חובש…) with the items they require; a kit can be marked with one.

-- ── New structure ──
ALTER TABLE "KitItemDef" ADD COLUMN "optional" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PersonalKit" ADD COLUMN "pakalId" TEXT;

CREATE TABLE "Pakal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pakal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PakalItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pakalId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PakalItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Pakal_companyId_name_key" ON "Pakal"("companyId", "name");
CREATE INDEX "PakalItem_itemId_idx" ON "PakalItem"("itemId");
CREATE UNIQUE INDEX "PakalItem_pakalId_itemId_key" ON "PakalItem"("pakalId", "itemId");

ALTER TABLE "PersonalKit" ADD CONSTRAINT "PersonalKit_pakalId_fkey" FOREIGN KEY ("pakalId") REFERENCES "Pakal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Pakal" ADD CONSTRAINT "Pakal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PakalItem" ADD CONSTRAINT "PakalItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PakalItem" ADD CONSTRAINT "PakalItem_pakalId_fkey" FOREIGN KEY ("pakalId") REFERENCES "Pakal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PakalItem" ADD CONSTRAINT "PakalItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "KitItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Data: weapon-card ammo → checklist lines ──

-- Checklist items "מחסניות" and "כדורים" for every company that doesn't have one by that name yet.
-- Target = the most common non-zero amount on its kits (fallback 7 / 210). They start present:
-- a kit in stock is kept with its magazines and rounds.
INSERT INTO "KitItemDef" ("id", "companyId", "label", "groupName", "sortOrder", "targetQuantity", "startPresent", "optional", "isActive", "createdAt", "updatedAt")
SELECT 'mig' || replace(gen_random_uuid()::text, '-', ''), c."id", v.label, 'תחמושת',
       COALESCE((SELECT max("sortOrder") FROM "KitItemDef" d WHERE d."companyId" = c."id"), 0) + v.ord * 10,
       COALESCE(
         (SELECT CASE WHEN v.label = 'מחסניות' THEN k."magazineCount" ELSE k."ammoCount" END
            FROM "PersonalKit" k
           WHERE k."companyId" = c."id" AND (CASE WHEN v.label = 'מחסניות' THEN k."magazineCount" ELSE k."ammoCount" END) > 0
           GROUP BY 1 ORDER BY count(*) DESC, 1 DESC LIMIT 1),
         v.fallback),
       true, false, true, now(), now()
FROM "Company" c
CROSS JOIN (VALUES ('מחסניות', 1, 7), ('כדורים', 2, 210)) AS v(label, ord, fallback)
WHERE NOT EXISTS (SELECT 1 FROM "KitItemDef" d WHERE d."companyId" = c."id" AND d."label" = v.label);

-- Extra ammo types already typed on weapon cards (e.g. "תופי נגב") become optional checklist items.
INSERT INTO "KitItemDef" ("id", "companyId", "label", "groupName", "sortOrder", "targetQuantity", "startPresent", "optional", "isActive", "createdAt", "updatedAt")
SELECT 'mig' || replace(gen_random_uuid()::text, '-', ''), x."companyId", x.label, 'תחמושת',
       COALESCE((SELECT max("sortOrder") FROM "KitItemDef" d WHERE d."companyId" = x."companyId"), 0)
         + 10 * row_number() OVER (PARTITION BY x."companyId" ORDER BY x.label),
       x.qty, false, true, true, now(), now()
FROM (
  SELECT k."companyId", trim(e->>'label') AS label, max((e->>'quantity')::int) AS qty
  FROM "PersonalKit" k, jsonb_array_elements(k."extraAmmo") e
  WHERE trim(e->>'label') <> '' AND (e->>'quantity') ~ '^[0-9]+$' AND (e->>'quantity')::int > 0
  GROUP BY 1, 2
) x
WHERE NOT EXISTS (SELECT 1 FROM "KitItemDef" d WHERE d."companyId" = x."companyId" AND d."label" = x.label);

-- Each kit's magazines / rounds go into its checklist row:
--   issued kits: the weapon-card amount (signed kits also signed for it);
--   never-issued kits: the start state (full);
--   returned kits in stock: unchanged (their card had been cleared on return).
INSERT INTO "KitItemStatus" ("id", "companyId", "kitId", "itemId", "present", "quantity", "baseline", "updatedAt")
SELECT 'mig' || replace(gen_random_uuid()::text, '-', ''), k."companyId", k."id", d."id", false,
       CASE
         WHEN k."soldierId" IS NOT NULL THEN CASE WHEN d."label" = 'מחסניות' THEN k."magazineCount" ELSE k."ammoCount" END
         WHEN NOT EXISTS (SELECT 1 FROM "KitReturn" r WHERE r."kitId" = k."id") THEN d."targetQuantity"
         ELSE 0
       END,
       CASE WHEN k."soldierId" IS NOT NULL AND k."signedAt" IS NOT NULL
            THEN CASE WHEN d."label" = 'מחסניות' THEN k."magazineCount" ELSE k."ammoCount" END END,
       now()
FROM "PersonalKit" k
JOIN "KitItemDef" d ON d."companyId" = k."companyId" AND d."label" IN ('מחסניות', 'כדורים') AND d."targetQuantity" IS NOT NULL
ON CONFLICT ("kitId", "itemId") DO UPDATE
  SET "quantity" = CASE WHEN EXCLUDED."baseline" IS NOT NULL OR EXCLUDED."quantity" > COALESCE("KitItemStatus"."quantity", 0)
                        THEN GREATEST(EXCLUDED."quantity", COALESCE("KitItemStatus"."quantity", 0)) ELSE "KitItemStatus"."quantity" END,
      "baseline" = COALESCE(EXCLUDED."baseline", "KitItemStatus"."baseline");

-- Extra ammo: the kits that had it get the row (signed kits also signed for it).
INSERT INTO "KitItemStatus" ("id", "companyId", "kitId", "itemId", "present", "quantity", "baseline", "updatedAt")
SELECT 'mig' || replace(gen_random_uuid()::text, '-', ''), k."companyId", k."id", d."id", false, x.qty,
       CASE WHEN k."signedAt" IS NOT NULL THEN x.qty END, now()
FROM "PersonalKit" k
JOIN (
  SELECT k2."id" AS kit_id, trim(e->>'label') AS label, sum((e->>'quantity')::int) AS qty
  FROM "PersonalKit" k2, jsonb_array_elements(k2."extraAmmo") e
  WHERE trim(e->>'label') <> '' AND (e->>'quantity') ~ '^[0-9]+$'
  GROUP BY 1, 2
) x ON x.kit_id = k."id"
JOIN "KitItemDef" d ON d."companyId" = k."companyId" AND d."label" = x.label
ON CONFLICT ("kitId", "itemId") DO UPDATE
  SET "quantity" = GREATEST(EXCLUDED."quantity", COALESCE("KitItemStatus"."quantity", 0)),
      "baseline" = COALESCE(EXCLUDED."baseline", "KitItemStatus"."baseline");

-- ── The weapon card keeps only the weapon ──
ALTER TABLE "PersonalKit" DROP COLUMN "ammoCount", DROP COLUMN "extraAmmo", DROP COLUMN "magazineCount";
