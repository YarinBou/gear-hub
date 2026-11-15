-- Per-deployment participation: soldiers who are NOT in a deployment.
-- CreateTable
CREATE TABLE "DeploymentAbsence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "soldierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeploymentAbsence_soldierId_idx" ON "DeploymentAbsence"("soldierId");

-- CreateIndex
CREATE INDEX "DeploymentAbsence_companyId_idx" ON "DeploymentAbsence"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentAbsence_deploymentId_soldierId_key" ON "DeploymentAbsence"("deploymentId", "soldierId");

-- AddForeignKey
ALTER TABLE "DeploymentAbsence" ADD CONSTRAINT "DeploymentAbsence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentAbsence" ADD CONSTRAINT "DeploymentAbsence_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentAbsence" ADD CONSTRAINT "DeploymentAbsence_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

