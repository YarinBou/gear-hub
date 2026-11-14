-- CreateEnum
CREATE TYPE "AmmoLogType" AS ENUM ('COUNT', 'RECEIVE', 'ISSUE');

-- CreateTable
CREATE TABLE "AmmoLog" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "type" "AmmoLogType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "note" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmmoLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmmoLog_stockId_createdAt_idx" ON "AmmoLog"("stockId", "createdAt");

-- AddForeignKey
ALTER TABLE "AmmoLog" ADD CONSTRAINT "AmmoLog_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "AmmoStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmmoLog" ADD CONSTRAINT "AmmoLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
