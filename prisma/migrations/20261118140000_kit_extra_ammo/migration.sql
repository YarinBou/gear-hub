-- Extra ammunition a soldier signs for on the weapon card, beyond magazines and rounds
-- (e.g. Negev / MAG belt boxes for machine gunners): [{ "label": "תופי נגב", "quantity": 2 }, …].
ALTER TABLE "PersonalKit" ADD COLUMN "extraAmmo" JSONB NOT NULL DEFAULT '[]';
