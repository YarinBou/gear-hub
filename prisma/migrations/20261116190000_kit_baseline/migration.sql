-- What each soldier signed for (per kit line). NULL = no personal baseline (the company's default
-- applies), 0 = not part of this kit, n = the signed quantity (1 for plain present / missing lines).
ALTER TABLE "KitItemStatus" ADD COLUMN "baseline" INTEGER;

-- Kits already signed: what is marked on them now is what the soldier signed for.
UPDATE "KitItemStatus" s
SET "baseline" = CASE
    WHEN d."targetQuantity" IS NULL THEN (CASE WHEN s."present" THEN 1 ELSE 0 END)
    ELSE COALESCE(s."quantity", 0)
  END
FROM "KitItemDef" d, "PersonalKit" k
WHERE d."id" = s."itemId" AND k."id" = s."kitId" AND k."signedAt" IS NOT NULL;
