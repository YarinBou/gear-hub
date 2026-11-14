-- Deployments (הפעלות). Who holds what, the personal kits and the ammo stock move from the
-- company to a deployment. Items keep only their physical identity; their holder / status /
-- platoon / last-verified move to EquipmentAssignment (one row per item per deployment).
--
-- Existing data: a company that already has operational data (items, ammo, issued or inspected
-- kits, equipment history) gets one ACTIVE deployment, "הפעלה נוכחית", holding all of it.
-- A company without any gets no deployment, and its blank placeholder kits are removed
-- (kits are now created when a deployment starts).

-- ── Deployment ──
CREATE TYPE "DeploymentStatus" AS ENUM ('ACTIVE', 'CLOSED');

CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeCompanyId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id"),
    -- activeCompanyId is the company while ACTIVE and null once CLOSED (one active per company).
    CONSTRAINT "Deployment_active_matches_status" CHECK (
      ("status" = 'ACTIVE' AND "activeCompanyId" = "companyId")
      OR ("status" = 'CLOSED' AND "activeCompanyId" IS NULL)
    )
);
CREATE UNIQUE INDEX "Deployment_activeCompanyId_key" ON "Deployment"("activeCompanyId");
CREATE UNIQUE INDEX "Deployment_companyId_name_key" ON "Deployment"("companyId", "name");
CREATE INDEX "Deployment_companyId_status_idx" ON "Deployment"("companyId", "status");

INSERT INTO "Deployment" ("id", "companyId", "name", "status", "activeCompanyId", "updatedAt")
SELECT 'dep_initial_' || c."id", c."id", 'הפעלה נוכחית', 'ACTIVE', c."id", CURRENT_TIMESTAMP
FROM "Company" c
WHERE EXISTS (SELECT 1 FROM "EquipmentItem" i WHERE i."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "AmmoStock" s WHERE s."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "EquipmentLog" l WHERE l."companyId" = c."id")
   OR EXISTS (SELECT 1 FROM "KitInspection" k WHERE k."companyId" = c."id")
   OR EXISTS (
     SELECT 1 FROM "PersonalKit" k
     WHERE k."companyId" = c."id" AND (k."soldierId" IS NOT NULL OR k."signedAt" IS NOT NULL)
   );

-- ── EquipmentAssignment: copy each item's current state into its company's deployment ──
CREATE TABLE "EquipmentAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'IN_ARMORY',
    "soldierId" TEXT,
    "platoon" "Platoon",
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentAssignment_pkey" PRIMARY KEY ("id")
);

INSERT INTO "EquipmentAssignment"
  ("id", "companyId", "deploymentId", "itemId", "status", "soldierId", "platoon", "lastVerifiedAt", "updatedAt")
SELECT 'asg_' || i."id", i."companyId", d."id", i."id", i."status", i."assignedSoldierId", i."platoon", i."lastVerifiedAt", CURRENT_TIMESTAMP
FROM "EquipmentItem" i
JOIN "Deployment" d ON d."companyId" = i."companyId";

CREATE UNIQUE INDEX "EquipmentAssignment_deploymentId_itemId_key" ON "EquipmentAssignment"("deploymentId", "itemId");
CREATE INDEX "EquipmentAssignment_deploymentId_status_idx" ON "EquipmentAssignment"("deploymentId", "status");
CREATE INDEX "EquipmentAssignment_deploymentId_soldierId_idx" ON "EquipmentAssignment"("deploymentId", "soldierId");
CREATE INDEX "EquipmentAssignment_deploymentId_platoon_idx" ON "EquipmentAssignment"("deploymentId", "platoon");
CREATE INDEX "EquipmentAssignment_deploymentId_lastVerifiedAt_idx" ON "EquipmentAssignment"("deploymentId", "lastVerifiedAt");
CREATE INDEX "EquipmentAssignment_itemId_idx" ON "EquipmentAssignment"("itemId");

-- Item state now lives in EquipmentAssignment.
ALTER TABLE "EquipmentItem" DROP CONSTRAINT "EquipmentItem_assignedSoldierId_fkey";
DROP INDEX "EquipmentItem_companyId_status_idx";
DROP INDEX "EquipmentItem_platoon_idx";
DROP INDEX "EquipmentItem_assignedSoldierId_idx";
DROP INDEX "EquipmentItem_lastVerifiedAt_idx";
ALTER TABLE "EquipmentItem"
  DROP COLUMN "assignedSoldierId",
  DROP COLUMN "lastVerifiedAt",
  DROP COLUMN "platoon",
  DROP COLUMN "status";

-- ── EquipmentLog: which deployment a change happened in ──
ALTER TABLE "EquipmentLog" ADD COLUMN "deploymentId" TEXT;
UPDATE "EquipmentLog" l SET "deploymentId" = d."id" FROM "Deployment" d WHERE d."companyId" = l."companyId";
CREATE INDEX "EquipmentLog_deploymentId_idx" ON "EquipmentLog"("deploymentId");

-- ── AmmoStock: per deployment ──
ALTER TABLE "AmmoStock" ADD COLUMN "deploymentId" TEXT;
UPDATE "AmmoStock" s SET "deploymentId" = d."id" FROM "Deployment" d WHERE d."companyId" = s."companyId";
ALTER TABLE "AmmoStock" ALTER COLUMN "deploymentId" SET NOT NULL;
DROP INDEX "AmmoStock_categoryId_location_key";
CREATE UNIQUE INDEX "AmmoStock_deploymentId_categoryId_location_key" ON "AmmoStock"("deploymentId", "categoryId", "location");

-- ── PersonalKit: per deployment ──
ALTER TABLE "PersonalKit" ADD COLUMN "deploymentId" TEXT;
UPDATE "PersonalKit" k SET "deploymentId" = d."id" FROM "Deployment" d WHERE d."companyId" = k."companyId";
-- Companies without a deployment only had blank placeholder kits (no holder, signature or inspection).
DELETE FROM "PersonalKit" WHERE "deploymentId" IS NULL;
ALTER TABLE "PersonalKit" ALTER COLUMN "deploymentId" SET NOT NULL;
DROP INDEX "PersonalKit_soldierId_key";
DROP INDEX "PersonalKit_personalWeaponId_key";
DROP INDEX "PersonalKit_companyId_kitNumber_key";
CREATE UNIQUE INDEX "PersonalKit_deploymentId_kitNumber_key" ON "PersonalKit"("deploymentId", "kitNumber");
CREATE UNIQUE INDEX "PersonalKit_deploymentId_soldierId_key" ON "PersonalKit"("deploymentId", "soldierId");
CREATE UNIQUE INDEX "PersonalKit_deploymentId_personalWeaponId_key" ON "PersonalKit"("deploymentId", "personalWeaponId");
CREATE INDEX "PersonalKit_companyId_idx" ON "PersonalKit"("companyId");

-- ── Foreign keys ──
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmmoStock" ADD CONSTRAINT "AmmoStock_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalKit" ADD CONSTRAINT "PersonalKit_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
