-- Items a soldier holds outside any kit (e.g. a thigh pouch handed out on the move), per deployment, and their returns.

-- CreateTable
CREATE TABLE "SoldierItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "soldierId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoldierItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoldierItemReturn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "soldierId" TEXT,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "gapCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoldierItemReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoldierItem_companyId_idx" ON "SoldierItem"("companyId");

-- CreateIndex
CREATE INDEX "SoldierItem_itemId_idx" ON "SoldierItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "SoldierItem_deploymentId_soldierId_itemId_key" ON "SoldierItem"("deploymentId", "soldierId", "itemId");

-- CreateIndex
CREATE INDEX "SoldierItemReturn_soldierId_createdAt_idx" ON "SoldierItemReturn"("soldierId", "createdAt");

-- CreateIndex
CREATE INDEX "SoldierItemReturn_companyId_idx" ON "SoldierItemReturn"("companyId");

-- AddForeignKey
ALTER TABLE "SoldierItem" ADD CONSTRAINT "SoldierItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItem" ADD CONSTRAINT "SoldierItem_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItem" ADD CONSTRAINT "SoldierItem_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItem" ADD CONSTRAINT "SoldierItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "KitItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItem" ADD CONSTRAINT "SoldierItem_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItemReturn" ADD CONSTRAINT "SoldierItemReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItemReturn" ADD CONSTRAINT "SoldierItemReturn_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItemReturn" ADD CONSTRAINT "SoldierItemReturn_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItemReturn" ADD CONSTRAINT "SoldierItemReturn_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

