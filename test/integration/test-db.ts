import { Client } from "pg";

// Integration tests DELETE every row in their database. Two guards keep them away from real data:
// 1. TEST_DATABASE_URL must be set explicitly and must differ from the app's own URLs in .env.
// 2. The database must carry a marker table, created once on purpose with `npm run test:mark-db`.
//    A Neon branch made from production doesn't have it, so a copy-pasted production URL is refused.

export const MARKER_TABLE = "_gearhub_test_db";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Create a Neon branch for tests, put its DIRECT (non-pooled) URL in .env.test " +
        "as TEST_DATABASE_URL, then run `npm run test:mark-db` once.",
    );
  }
  for (const key of ["APP_DATABASE_URL", "APP_DIRECT_URL"] as const) {
    if (process.env[key] && sameDatabase(process.env[key]!, url)) {
      throw new Error(`TEST_DATABASE_URL points at the same database as ${key.replace("APP_", "")} in .env — use a separate branch.`);
    }
  }
  return url;
}

function sameDatabase(a: string, b: string) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    // Neon's pooled host is the direct host with "-pooler" added.
    const host = (u: URL) => u.hostname.replace("-pooler", "");
    return host(ua) === host(ub) && ua.port === ub.port && ua.pathname === ub.pathname;
  } catch {
    return a === b;
  }
}

export function describeUrl(url: string) {
  const u = new URL(url);
  return `${u.hostname}${u.pathname}`;
}

export async function hasMarker(url: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ t: string | null }>("SELECT to_regclass($1) AS t", [`public.${MARKER_TABLE}`]);
    return rows[0]?.t != null;
  } finally {
    await client.end();
  }
}

/** Read the app's own URLs from .env so the guard can compare (without letting them leak into tests). */
export function rememberAppUrls(parsed: Record<string, string> | undefined) {
  if (parsed?.DATABASE_URL) process.env.APP_DATABASE_URL = parsed.DATABASE_URL;
  if (parsed?.DIRECT_URL) process.env.APP_DIRECT_URL = parsed.DIRECT_URL;
}
