import { execSync } from "node:child_process";
import { config } from "dotenv";
import { describeUrl, hasMarker, rememberAppUrls, testDatabaseUrl } from "./test-db";

// Once per run: check the guards, then bring the test DB schema up to date with
// `prisma migrate deploy` — exactly what production runs. It only applies pending migrations;
// tests empty the tables themselves (db.ts).
export default async function setup() {
  rememberAppUrls(config({ path: ".env", quiet: true }).parsed);
  config({ path: ".env.test", override: true, quiet: true });
  const url = testDatabaseUrl();

  if (!(await hasMarker(url))) {
    throw new Error(
      `${describeUrl(url)} is not marked as a test database. Integration tests delete all of its data.\n` +
        "If this really is a throwaway branch, run `npm run test:mark-db` once.",
    );
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    // prisma.config.ts reads DIRECT_URL first; point every candidate at the test DB.
    env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
  });
}
