import { execSync } from "node:child_process";
import { config } from "dotenv";
import { Client } from "pg";
import { describeUrl, rememberAppUrls } from "./integration/test-db";

// Migration rehearsal: run pending migrations + the seed on a COPY of production
// (a Neon branch made from the production branch) and verify nothing was lost.
//
//   REHEARSAL_DATABASE_URL in .env.test → direct (non-pooled) URL of the copy
//   npm run db:rehearse            → shows the target, changes nothing
//   npm run db:rehearse -- --yes   → migrates + seeds the copy, then verifies
//
// Checks: every table keeps its row count, every company-owned row has a company, only
// SUPER_ADMINs are company-less, the migrated schema matches schema.prisma, and the seed is
// a no-op for existing data (no duplicate catalog types or kits).

const OWNED = [
  "Soldier",
  "EquipmentCategory",
  "EquipmentItem",
  "EquipmentLog",
  "AmmoStock",
  "AmmoLog",
  "PersonalKit",
  "KitInspection",
  "KitReturn",
  "StorageItem",
];

async function counts(client: Client) {
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_%' ORDER BY tablename",
  );
  const out: Record<string, number> = {};
  for (const { tablename } of rows) {
    const r = await client.query<{ n: string }>(`SELECT count(*) AS n FROM "public"."${tablename}"`);
    out[tablename] = Number(r.rows[0].n);
  }
  return out;
}

async function scalar(client: Client, sql: string) {
  const { rows } = await client.query<{ n: string }>(sql);
  return Number(rows[0].n);
}

function run(cmd: string, url: string, extraEnv: Record<string, string> = {}) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, ...extraEnv },
  });
}

async function main() {
  rememberAppUrls(config({ path: ".env", quiet: true }).parsed);
  config({ path: ".env.test", override: true, quiet: true });
  const url = process.env.REHEARSAL_DATABASE_URL;
  if (!url) throw new Error("Set REHEARSAL_DATABASE_URL in .env.test (direct URL of a Neon branch copied from production).");
  for (const key of ["APP_DATABASE_URL", "APP_DIRECT_URL", "TEST_DATABASE_URL"]) {
    if (process.env[key] && new URL(process.env[key]!).hostname.replace("-pooler", "") === new URL(url).hostname.replace("-pooler", "")) {
      throw new Error(`REHEARSAL_DATABASE_URL is the same database as ${key.replace("APP_", "")} — use a fresh branch.`);
    }
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const applied = await client.query<{ migration_name: string }>(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name",
    );
    const before = await counts(client);
    console.log(`Target: ${describeUrl(url)}`);
    console.log(`Applied migrations: ${applied.rows.length} (latest: ${applied.rows.at(-1)?.migration_name ?? "none"})`);
    console.log("Rows before:", before);

    if (!process.argv.includes("--yes")) {
      console.log("\nThis will run `prisma migrate deploy` and the seed on that database. To go ahead:");
      console.log("  npm run db:rehearse -- --yes");
      return;
    }

    console.log("\n→ prisma migrate deploy");
    console.log(run("npx prisma migrate deploy", url).split("\n").filter((l) => /migration|Applying|applied/i.test(l)).join("\n"));

    const after = await counts(client);
    const problems: string[] = [];

    for (const [table, n] of Object.entries(before)) {
      if (after[table] !== n) problems.push(`${table}: ${n} rows before, ${after[table]} after`);
    }
    for (const table of OWNED) {
      const orphans = await scalar(client, `SELECT count(*) AS n FROM "${table}" WHERE "companyId" IS NULL`);
      if (orphans) problems.push(`${table}: ${orphans} rows without a company`);
    }
    const badUsers = await scalar(
      client,
      `SELECT count(*) AS n FROM "User" WHERE ("role"::text = 'SUPER_ADMIN') <> ("companyId" IS NULL)`,
    );
    if (badUsers) problems.push(`User: ${badUsers} rows whose company doesn't match their role`);
    const companies = await client.query<{ id: string; name: string }>(`SELECT id, name FROM "Company"`);
    console.log("Companies after migration:", companies.rows);

    const drift = run("npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script", url)
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("--") && !/Loaded Prisma config/.test(l))
      .join("\n")
      .trim();
    if (drift && drift !== "-- This is an empty migration.") problems.push(`Schema drift after migration:\n${drift}`);

    console.log("\n→ seed (super-admin; company + admin should already exist)");
    const seedOut = run("npx tsx prisma/seed.ts", url, { SEED_DEMO: "0" });
    console.log(seedOut.replace(/generated password: \S+/g, "generated password: [hidden — rehearsal only]").trim());

    const afterSeed = await counts(client);
    for (const table of [...OWNED, "Company"]) {
      if (afterSeed[table] !== after[table]) {
        problems.push(`seed changed ${table}: ${after[table]} → ${afterSeed[table]} (expected no change)`);
      }
    }
    const supers = await scalar(client, `SELECT count(*) AS n FROM "User" WHERE "role"::text = 'SUPER_ADMIN'`);
    if (supers < 1) problems.push("seed did not create a SUPER_ADMIN");

    console.log("\nRows after migration + seed:", afterSeed);
    if (problems.length) {
      console.error("\n✗ Rehearsal FAILED:\n- " + problems.join("\n- "));
      process.exitCode = 1;
    } else {
      console.log("\n✓ Rehearsal passed: no rows lost, every row has a company, schema matches, seed is idempotent.");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
