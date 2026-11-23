-- בדיקת תכולה: when a kit's contents were last checked in full (and by whom), and a flag on inspection
-- records for full contents checks of kits in stock. Existing kits start as not checked.
ALTER TABLE "KitInspection" ADD COLUMN "fullCheck" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PersonalKit" ADD COLUMN "contentsCheckedAt" TIMESTAMP(3),
ADD COLUMN "contentsCheckedById" TEXT;

ALTER TABLE "PersonalKit" ADD CONSTRAINT "PersonalKit_contentsCheckedById_fkey" FOREIGN KEY ("contentsCheckedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
