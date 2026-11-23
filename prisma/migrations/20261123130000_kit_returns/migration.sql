-- Kit returns (זיכוי ערכה): what the soldier signed for vs what came back, with notes on gaps.
-- CreateTable
CREATE TABLE "KitReturn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "soldierId" TEXT,
    "soldierName" TEXT NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "gapCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KitReturn_kitId_createdAt_idx" ON "KitReturn"("kitId", "createdAt");

-- CreateIndex
CREATE INDEX "KitReturn_soldierId_idx" ON "KitReturn"("soldierId");

-- CreateIndex
CREATE INDEX "KitReturn_companyId_idx" ON "KitReturn"("companyId");

-- AddForeignKey
ALTER TABLE "KitReturn" ADD CONSTRAINT "KitReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitReturn" ADD CONSTRAINT "KitReturn_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "PersonalKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitReturn" ADD CONSTRAINT "KitReturn_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitReturn" ADD CONSTRAINT "KitReturn_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

