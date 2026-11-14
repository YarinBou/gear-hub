import { prisma } from "@/lib/prisma";
import { MARKER_TABLE } from "./test-db";

/**
 * Empty every application table in one round trip (the test DB is remote, so this matters).
 * Keeps the schema, the migrations table, and the test-database marker table (see test-db.ts).
 */
export async function resetDatabase() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', ${MARKER_TABLE})`;
  if (!rows.length) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
