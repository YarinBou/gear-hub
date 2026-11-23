-- An item that is not held by anyone can't be "with soldier": such rows (e.g. a soldier record
-- removed under it) become "stored" — the status a returned item gets from now on.
UPDATE "EquipmentAssignment" SET status = 'STORED', "updatedAt" = now()
WHERE "soldierId" IS NULL AND status = 'WITH_SOLDIER';
