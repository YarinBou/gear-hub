-- Kit count per company (was a constant 98). Existing companies keep 98.
ALTER TABLE "Company" ADD COLUMN "kitCount" INTEGER NOT NULL DEFAULT 98;
ALTER TABLE "Company" ADD CONSTRAINT "Company_kitCount_range" CHECK ("kitCount" BETWEEN 1 AND 500);
