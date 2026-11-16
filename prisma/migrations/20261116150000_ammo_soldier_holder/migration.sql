-- Ammo held by a specific soldier: AmmoStock.soldierId (nullable; null = stored at a place).
-- AlterTable
ALTER TABLE "AmmoStock" ADD COLUMN "soldierId" TEXT;

-- CreateIndex
CREATE INDEX "AmmoStock_soldierId_idx" ON "AmmoStock"("soldierId");

-- AddForeignKey
ALTER TABLE "AmmoStock" ADD CONSTRAINT "AmmoStock_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
