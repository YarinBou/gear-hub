-- Each checklist item has its own start state for new kits (present / missing), instead of one
-- company-wide switch. Every item starts with the company's current setting.
-- Company."kitDefaultPresent" stays: it is the start state offered for items added from now on.

ALTER TABLE "KitItemDef" ADD COLUMN "startPresent" BOOLEAN NOT NULL DEFAULT false;

UPDATE "KitItemDef" d
SET "startPresent" = c."kitDefaultPresent"
FROM "Company" c
WHERE c."id" = d."companyId";
