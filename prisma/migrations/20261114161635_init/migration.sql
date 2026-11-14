-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'REGULAR');

-- CreateEnum
CREATE TYPE "Platoon" AS ENUM ('PLATOON_1', 'PLATOON_2', 'PLATOON_3', 'HQ');

-- CreateEnum
CREATE TYPE "CatalogDomain" AS ENUM ('EQUIPMENT', 'AMMUNITION', 'STORAGE');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('IN_ARMORY', 'WITH_SOLDIER', 'IN_REPAIR', 'STORED', 'MISSING');

-- CreateEnum
CREATE TYPE "AmmoCategory" AS ENUM ('EXPLOSIVE', 'NON_LETHAL', 'STANDARD');

-- CreateEnum
CREATE TYPE "StorageStatus" AS ENUM ('OK', 'SHORTAGE', 'DAMAGED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'REGULAR',
    "platoon" "Platoon",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Soldier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personalNumber" TEXT,
    "phone" TEXT,
    "platoon" "Platoon" NOT NULL,
    "position" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Soldier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" "CatalogDomain" NOT NULL,
    "description" TEXT,
    "ammoCategory" "AmmoCategory",
    "minThreshold" INTEGER,
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentItem" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'IN_ARMORY',
    "assignedSoldierId" TEXT,
    "platoon" "Platoon",
    "lastVerifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentLog" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromSoldierId" TEXT,
    "toSoldierId" TEXT,
    "fromStatus" "EquipmentStatus",
    "toStatus" "EquipmentStatus",
    "platoon" "Platoon",
    "note" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmmoStock" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "lastCountedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmmoStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalKit" (
    "id" TEXT NOT NULL,
    "kitNumber" INTEGER NOT NULL,
    "soldierId" TEXT,
    "personalWeaponId" TEXT,
    "rifleType" TEXT,
    "weaponIssued" BOOLEAN NOT NULL DEFAULT false,
    "magazineCount" INTEGER NOT NULL DEFAULT 0,
    "ammoCount" INTEGER NOT NULL DEFAULT 0,
    "cleaningKit" BOOLEAN NOT NULL DEFAULT false,
    "weaponSling" BOOLEAN NOT NULL DEFAULT false,
    "weaponOil" BOOLEAN NOT NULL DEFAULT false,
    "uniform1" BOOLEAN NOT NULL DEFAULT false,
    "uniform2" BOOLEAN NOT NULL DEFAULT false,
    "workBelt" BOOLEAN NOT NULL DEFAULT false,
    "sleepingBag" BOOLEAN NOT NULL DEFAULT false,
    "tacticalEyewear" BOOLEAN NOT NULL DEFAULT false,
    "kneePads" BOOLEAN NOT NULL DEFAULT false,
    "gearBag90L" BOOLEAN NOT NULL DEFAULT false,
    "tacticalVest" BOOLEAN NOT NULL DEFAULT false,
    "ceramicPlates" BOOLEAN NOT NULL DEFAULT false,
    "helmet" BOOLEAN NOT NULL DEFAULT false,
    "catTourniquet" BOOLEAN NOT NULL DEFAULT false,
    "headlamp" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "signedById" TEXT,
    "signatureData" TEXT,
    "lastInspectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitInspection" (
    "id" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "missingItems" TEXT[],
    "performedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "targetQuantity" INTEGER NOT NULL DEFAULT 0,
    "currentQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" "StorageStatus" NOT NULL DEFAULT 'OK',
    "expiryDate" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Soldier_personalNumber_key" ON "Soldier"("personalNumber");

-- CreateIndex
CREATE INDEX "Soldier_platoon_idx" ON "Soldier"("platoon");

-- CreateIndex
CREATE INDEX "Soldier_name_idx" ON "Soldier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentCategory_domain_name_key" ON "EquipmentCategory"("domain", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentItem_serialNumber_key" ON "EquipmentItem"("serialNumber");

-- CreateIndex
CREATE INDEX "EquipmentItem_status_idx" ON "EquipmentItem"("status");

-- CreateIndex
CREATE INDEX "EquipmentItem_platoon_idx" ON "EquipmentItem"("platoon");

-- CreateIndex
CREATE INDEX "EquipmentItem_assignedSoldierId_idx" ON "EquipmentItem"("assignedSoldierId");

-- CreateIndex
CREATE INDEX "EquipmentItem_lastVerifiedAt_idx" ON "EquipmentItem"("lastVerifiedAt");

-- CreateIndex
CREATE INDEX "EquipmentLog_itemId_createdAt_idx" ON "EquipmentLog"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AmmoStock_categoryId_location_key" ON "AmmoStock"("categoryId", "location");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalKit_kitNumber_key" ON "PersonalKit"("kitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalKit_soldierId_key" ON "PersonalKit"("soldierId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalKit_personalWeaponId_key" ON "PersonalKit"("personalWeaponId");

-- CreateIndex
CREATE INDEX "KitInspection_kitId_createdAt_idx" ON "KitInspection"("kitId", "createdAt");

-- CreateIndex
CREATE INDEX "StorageItem_expiryDate_idx" ON "StorageItem"("expiryDate");

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_assignedSoldierId_fkey" FOREIGN KEY ("assignedSoldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_fromSoldierId_fkey" FOREIGN KEY ("fromSoldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_toSoldierId_fkey" FOREIGN KEY ("toSoldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLog" ADD CONSTRAINT "EquipmentLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmoStock" ADD CONSTRAINT "AmmoStock_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalKit" ADD CONSTRAINT "PersonalKit_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalKit" ADD CONSTRAINT "PersonalKit_personalWeaponId_fkey" FOREIGN KEY ("personalWeaponId") REFERENCES "EquipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalKit" ADD CONSTRAINT "PersonalKit_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitInspection" ADD CONSTRAINT "KitInspection_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "PersonalKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitInspection" ADD CONSTRAINT "KitInspection_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageItem" ADD CONSTRAINT "StorageItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
