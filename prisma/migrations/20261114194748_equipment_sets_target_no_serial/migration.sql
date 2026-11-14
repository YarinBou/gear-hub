-- AlterTable
ALTER TABLE "EquipmentCategory" ADD COLUMN     "targetQuantity" INTEGER;

-- AlterTable
ALTER TABLE "EquipmentItem" ADD COLUMN     "parentId" TEXT,
ALTER COLUMN "serialNumber" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "EquipmentItem_parentId_idx" ON "EquipmentItem"("parentId");

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EquipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
