import { config } from "dotenv";
import { Client } from "pg";
import { describeUrl, MARKER_TABLE, rememberAppUrls, testDatabaseUrl } from "./integration/test-db";

// One-time, deliberate step: mark TEST_DATABASE_URL as a throwaway database that integration
// tests may wipe. Shows what's in it first; needs --yes to actually mark it.
//   npm run test:mark-db            → inspect only
//   npm run test:mark-db -- --yes   → mark it

async function main() {
  rememberAppUrls(config({ path: ".env", quiet: true }).parsed);
  config({ path: ".env.test", override: true, quiet: true });
  const url = testDatabaseUrl();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows: tables } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    console.log(`Database: ${describeUrl(url)}`);
    for (const { tablename } of tables) {
      const { rows } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM "public"."${tablename}"`);
      console.log(`  ${tablename.padEnd(24)} ${rows[0].n} rows`);
    }
    if (!tables.length) console.log("  (empty — no tables yet)");

    if (!process.argv.includes("--yes")) {
      console.log("\nIntegration tests will DELETE all rows above. If this is a throwaway branch, run:");
      console.log("  npm run test:mark-db -- --yes");
      return;
    }
    await client.query(`CREATE TABLE IF NOT EXISTS "public"."${MARKER_TABLE}" (marked_at timestamptz NOT NULL DEFAULT now())`);
    await client.query(`INSERT INTO "public"."${MARKER_TABLE}" DEFAULT VALUES`);
    console.log(`\nMarked ${describeUrl(url)} as a test database.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
