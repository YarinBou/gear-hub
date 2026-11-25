-- Properties per equipment type (e.g. case, PTT remote, helmet adapter, color), defined on /catalog,
-- and their values on each item. No data changes.
ALTER TABLE "EquipmentCategory" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "EquipmentItem" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}';
