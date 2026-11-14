-- Multi-company (tenants). Every company-owned table gets companyId.
-- Existing rows (a single company so far) move into one company, "פלוגה א".

-- ── Company ──
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- Only created when there is existing data to own.
INSERT INTO "Company" ("id", "name", "updatedAt")
SELECT 'company_initial', 'פלוגה א', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "User")
   OR EXISTS (SELECT 1 FROM "Soldier")
   OR EXISTS (SELECT 1 FROM "EquipmentCategory")
   OR EXISTS (SELECT 1 FROM "PersonalKit");

-- ── Role ──
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN' BEFORE 'ADMIN';

-- ── companyId columns: add nullable, backfill, then require ──
ALTER TABLE "User"              ADD COLUMN "companyId" TEXT;
ALTER TABLE "Soldier"           ADD COLUMN "companyId" TEXT;
ALTER TABLE "EquipmentCategory" ADD COLUMN "companyId" TEXT;
ALTER TABLE "EquipmentItem"     ADD COLUMN "companyId" TEXT;
ALTER TABLE "EquipmentLog"      ADD COLUMN "companyId" TEXT;
ALTER TABLE "AmmoStock"         ADD COLUMN "companyId" TEXT;
ALTER TABLE "AmmoLog"           ADD COLUMN "companyId" TEXT;
ALTER TABLE "PersonalKit"       ADD COLUMN "companyId" TEXT;
ALTER TABLE "KitInspection"     ADD COLUMN "companyId" TEXT;
ALTER TABLE "StorageItem"       ADD COLUMN "companyId" TEXT;

UPDATE "User"              SET "companyId" = 'company_initial';
UPDATE "Soldier"           SET "companyId" = 'company_initial';
UPDATE "EquipmentCategory" SET "companyId" = 'company_initial';
UPDATE "EquipmentItem"     SET "companyId" = 'company_initial';
UPDATE "EquipmentLog"      SET "companyId" = 'company_initial';
UPDATE "AmmoStock"         SET "companyId" = 'company_initial';
UPDATE "AmmoLog"           SET "companyId" = 'company_initial';
UPDATE "PersonalKit"       SET "companyId" = 'company_initial';
UPDATE "KitInspection"     SET "companyId" = 'company_initial';
UPDATE "StorageItem"       SET "companyId" = 'company_initial';

ALTER TABLE "Soldier"           ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "EquipmentCategory" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "EquipmentItem"     ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "EquipmentLog"      ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "AmmoStock"         ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "AmmoLog"           ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PersonalKit"       ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "KitInspection"     ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "StorageItem"       ALTER COLUMN "companyId" SET NOT NULL;

-- A user has no company if and only if they are a SUPER_ADMIN.
-- (Compared as text: a just-added enum value can't be referenced in the same transaction.)
ALTER TABLE "User" ADD CONSTRAINT "User_company_matches_role"
  CHECK (("role"::text = 'SUPER_ADMIN') = ("companyId" IS NULL));

-- ── Unique keys become per company ──
DROP INDEX "Soldier_personalNumber_key";
DROP INDEX "EquipmentCategory_domain_name_key";
DROP INDEX "EquipmentItem_serialNumber_key";
DROP INDEX "PersonalKit_kitNumber_key";

CREATE UNIQUE INDEX "Soldier_companyId_personalNumber_key" ON "Soldier"("companyId", "personalNumber");
CREATE UNIQUE INDEX "EquipmentCategory_companyId_domain_name_key" ON "EquipmentCategory"("companyId", "domain", "name");
CREATE UNIQUE INDEX "EquipmentItem_companyId_serialNumber_key" ON "EquipmentItem"("companyId", "serialNumber");
CREATE UNIQUE INDEX "PersonalKit_companyId_kitNumber_key" ON "PersonalKit"("companyId", "kitNumber");

-- ── Indexes ──
DROP INDEX "Soldier_platoon_idx";
DROP INDEX "Soldier_name_idx";
DROP INDEX "EquipmentItem_status_idx";

CREATE INDEX "User_companyId_idx" ON "User"("companyId");
CREATE INDEX "Soldier_companyId_platoon_idx" ON "Soldier"("companyId", "platoon");
CREATE INDEX "Soldier_companyId_name_idx" ON "Soldier"("companyId", "name");
CREATE INDEX "EquipmentItem_companyId_status_idx" ON "EquipmentItem"("companyId", "status");
CREATE INDEX "EquipmentLog_companyId_idx" ON "EquipmentLog"("companyId");
CREATE INDEX "AmmoStock_companyId_idx" ON "AmmoStock"("companyId");
CREATE INDEX "AmmoLog_companyId_idx" ON "AmmoLog"("companyId");
CREATE INDEX "KitInspection_companyId_idx" ON "KitInspection"("companyId");
CREATE INDEX "StorageItem_companyId_idx" ON "StorageItem"("companyId");

-- ── Foreign keys ──
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Soldier" ADD CONSTRAINT "Soldier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentCategory" ADD CONSTRAINT "EquipmentCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmmoStock" ADD CONSTRAINT "AmmoStock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmmoLog" ADD CONSTRAINT "AmmoLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalKit" ADD CONSTRAINT "PersonalKit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitInspection" ADD CONSTRAINT "KitInspection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StorageItem" ADD CONSTRAINT "StorageItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
