-- Equipment sets (מארזים): admin-defined main type + component lines; items record which set they are.
-- AlterTable
ALTER TABLE "EquipmentItem" ADD COLUMN     "setId" TEXT;

-- CreateTable
CREATE TABLE "EquipmentSet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mainCategoryId" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentSetSlot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EquipmentSetSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentSet_mainCategoryId_idx" ON "EquipmentSet"("mainCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentSet_companyId_name_key" ON "EquipmentSet"("companyId", "name");

-- CreateIndex
CREATE INDEX "EquipmentSetSlot_categoryId_idx" ON "EquipmentSetSlot"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentSetSlot_setId_categoryId_key" ON "EquipmentSetSlot"("setId", "categoryId");

-- CreateIndex
CREATE INDEX "EquipmentItem_setId_idx" ON "EquipmentItem"("setId");

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "EquipmentSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentSet" ADD CONSTRAINT "EquipmentSet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentSet" ADD CONSTRAINT "EquipmentSet_mainCategoryId_fkey" FOREIGN KEY ("mainCategoryId") REFERENCES "EquipmentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentSetSlot" ADD CONSTRAINT "EquipmentSetSlot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentSetSlot" ADD CONSTRAINT "EquipmentSetSlot_setId_fkey" FOREIGN KEY ("setId") REFERENCES "EquipmentSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentSetSlot" ADD CONSTRAINT "EquipmentSetSlot_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "EquipmentSetSlot" ADD CONSTRAINT "EquipmentSetSlot_quantity_positive" CHECK ("quantity" > 0);
