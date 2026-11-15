import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { Client } from "pg";
import { describeUrl, hasMarker, MARKER_TABLE, rememberAppUrls, testDatabaseUrl } from "../test/integration/test-db";
import { DEFAULT_KIT_ITEMS } from "../src/lib/kit";
import { E2E } from "./fixtures";

// Before the browser tests: same guards as the integration tests (the database must be the marked
// throwaway test database), then migrate, empty, and seed one known company.

export default async function globalSetup() {
  rememberAppUrls(config({ path: ".env", quiet: true }).parsed);
  config({ path: ".env.test", override: true, quiet: true });
  const url = testDatabaseUrl();
  if (!(await hasMarker(url))) {
    throw new Error(`${describeUrl(url)} is not marked as a test database — run \`npm run test:mark-db\` first.`);
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
  });

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const { rows } = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', $1)`,
      [MARKER_TABLE],
    );
    if (rows.length) {
      await db.query(`TRUNCATE ${rows.map((r) => `"public"."${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    }

    const id = () => randomUUID();
    const companyId = id();
    const hash = await bcrypt.hash(E2E.password, 10);
    await db.query(`INSERT INTO "Company"(id, name, "updatedAt") VALUES ($1, $2, now())`, [companyId, E2E.company]);
    await db.query(
      `INSERT INTO "User"(id, "companyId", username, name, "passwordHash", role, "updatedAt") VALUES
         ($1, $2, $3, 'מ"פ בדיקה', $4, 'ADMIN', now()),
         ($5, NULL, $6, 'מנהל מערכת', $4, 'SUPER_ADMIN', now())`,
      [id(), companyId, E2E.admin, hash, id(), E2E.superAdmin],
    );
    for (const [name, platoon] of E2E.soldiers) {
      await db.query(
        `INSERT INTO "Soldier"(id, "companyId", name, platoon, "updatedAt") VALUES ($1, $2, $3, $4, now())`,
        [id(), companyId, name, platoon],
      );
    }
    // The default personal-kit checklist (what provisionCompany gives a real company).
    for (const [i, item] of DEFAULT_KIT_ITEMS.entries()) {
      await db.query(
        `INSERT INTO "KitItemDef"(id, "companyId", label, "groupName", "sortOrder", "systemKey", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [id(), companyId, item.label, item.groupName, (i + 1) * 10, item.systemKey ?? null],
      );
    }
    const m16 = id();
    await db.query(
      `INSERT INTO "EquipmentCategory"(id, "companyId", name, domain, "updatedAt") VALUES ($1, $2, 'M16', 'EQUIPMENT', now())`,
      [m16, companyId],
    );
    await db.query(
      `INSERT INTO "EquipmentItem"(id, "companyId", "serialNumber", "categoryId", "updatedAt") VALUES ($1, $2, $3, $4, now())`,
      [id(), companyId, E2E.rifleSerial, m16],
    );
  } finally {
    await db.end();
  }
}
