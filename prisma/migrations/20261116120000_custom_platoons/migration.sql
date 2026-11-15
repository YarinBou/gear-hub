-- Platoons (מחלקות) become per-company rows instead of a fixed enum: any number, any names.
-- Every company gets its four current platoons as rows; soldiers, users, equipment state and
-- history keep pointing at the same platoon.
--
-- Prisma applies migration statements one by one (no implicit transaction). This one moves data,
-- so it runs as ONE explicit transaction: all or nothing.

BEGIN;

-- The old enum type has the name the new table needs.
ALTER TYPE "Platoon" RENAME TO "Platoon_old";

CREATE TABLE "Platoon" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "color" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platoon_pkey" PRIMARY KEY ("id")
);

-- ── The four existing platoons, for every company ──
CREATE TEMP TABLE "_platoon_map" ("companyId" TEXT, "key" TEXT, "id" TEXT) ON COMMIT DROP;
INSERT INTO "_platoon_map" ("companyId", "key", "id")
SELECT c."id", v."key", 'plt_' || md5(c."id" || ':' || v."key")
FROM "Company" c
CROSS JOIN (VALUES ('PLATOON_1'), ('PLATOON_2'), ('PLATOON_3'), ('HQ')) AS v("key");

INSERT INTO "Platoon" ("id", "companyId", "name", "sortOrder", "color", "updatedAt")
SELECT m."id", m."companyId", v."name", v."sortOrder", v."color", CURRENT_TIMESTAMP
FROM "_platoon_map" m
JOIN (VALUES
  ('PLATOON_1', 'מחלקה 1',        10, 0),
  ('PLATOON_2', 'מחלקה 2',        20, 1),
  ('PLATOON_3', 'מחלקה 3',        30, 2),
  ('HQ',        'חפ"ק ומפל"ג',    40, 3)
) AS v("key", "name", "sortOrder", "color") ON v."key" = m."key";

-- ── New columns, filled from the old enum columns ──
ALTER TABLE "Soldier" ADD COLUMN "platoonId" TEXT;
ALTER TABLE "User" ADD COLUMN "platoonId" TEXT;
ALTER TABLE "EquipmentAssignment" ADD COLUMN "platoonId" TEXT;
ALTER TABLE "EquipmentLog" ADD COLUMN "platoonId" TEXT;

UPDATE "Soldier" t SET "platoonId" = m."id"
FROM "_platoon_map" m WHERE m."companyId" = t."companyId" AND m."key" = t."platoon"::TEXT;

UPDATE "User" t SET "platoonId" = m."id"
FROM "_platoon_map" m WHERE m."companyId" = t."companyId" AND m."key" = t."platoon"::TEXT;

UPDATE "EquipmentAssignment" t SET "platoonId" = m."id"
FROM "_platoon_map" m WHERE m."companyId" = t."companyId" AND m."key" = t."platoon"::TEXT;

UPDATE "EquipmentLog" t SET "platoonId" = m."id"
FROM "_platoon_map" m WHERE m."companyId" = t."companyId" AND m."key" = t."platoon"::TEXT;

ALTER TABLE "Soldier" ALTER COLUMN "platoonId" SET NOT NULL;

-- ── Drop the enum columns ──
DROP INDEX "EquipmentAssignment_deploymentId_platoon_idx";
DROP INDEX "Soldier_companyId_platoon_idx";
ALTER TABLE "Soldier" DROP COLUMN "platoon";
ALTER TABLE "User" DROP COLUMN "platoon";
ALTER TABLE "EquipmentAssignment" DROP COLUMN "platoon";
ALTER TABLE "EquipmentLog" DROP COLUMN "platoon";
DROP TYPE "Platoon_old";

-- ── Indexes and keys ──
CREATE INDEX "Platoon_companyId_sortOrder_idx" ON "Platoon"("companyId", "sortOrder");
CREATE UNIQUE INDEX "Platoon_companyId_name_key" ON "Platoon"("companyId", "name");
CREATE INDEX "EquipmentAssignment_deploymentId_platoonId_idx" ON "EquipmentAssignment"("deploymentId", "platoonId");
CREATE INDEX "Soldier_companyId_platoonId_idx" ON "Soldier"("companyId", "platoonId");

ALTER TABLE "Platoon" ADD CONSTRAINT "Platoon_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_platoonId_fkey" FOREIGN KEY ("platoonId") REFERENCES "Platoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Soldier" ADD CONSTRAINT "Soldier_platoonId_fkey" FOREIGN KEY ("platoonId") REFERENCES "Platoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_platoonId_fkey" FOREIGN KEY ("platoonId") REFERENCES "Platoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_platoonId_fkey" FOREIGN KEY ("platoonId") REFERENCES "Platoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
