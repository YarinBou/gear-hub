-- Drums for machine gunners: "תופי נגב" and 'תופי מא"ג' become optional counted checklist items
-- (group "תחמושת") in every company that doesn't have an item by that name yet. Optional: a kit holds
-- them only when the soldier signs for them or its פק"ל requires them. The quantity can be changed
-- on /kits/items. No kit rows are needed — a missing row reads as none in the kit.
INSERT INTO "KitItemDef" ("id", "companyId", "label", "groupName", "sortOrder", "targetQuantity", "startPresent", "optional", "isActive", "createdAt", "updatedAt")
SELECT 'mig' || replace(gen_random_uuid()::text, '-', ''), c."id", v.label, 'תחמושת',
       COALESCE((SELECT max("sortOrder") FROM "KitItemDef" d WHERE d."companyId" = c."id"), 0) + v.ord * 10,
       4, false, true, true, now(), now()
FROM "Company" c
CROSS JOIN (VALUES ('תופי נגב', 1), ('תופי מא"ג', 2)) AS v(label, ord)
WHERE NOT EXISTS (SELECT 1 FROM "KitItemDef" d WHERE d."companyId" = c."id" AND d."label" = v.label);
