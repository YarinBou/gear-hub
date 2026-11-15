import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Serverless-friendly Prisma client:
// - Uses the pg driver adapter (no Rust engine binary in the function bundle).
// - Connects through the POOLED URL (Supabase transaction pooler / Neon -pooler).
// - Small per-instance pool; one client reused across warm invocations / HMR.
// - Created lazily on first use, so importing this module never needs env vars (e.g. at build time).
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString: explicitSslMode(connectionString), max: 5, idleTimeoutMillis: 10_000 });
  return new PrismaClient({
    adapter,
    // Interactive transactions (equipment moves, starting a deployment) make many round trips;
    // Prisma's 5 s default is too tight for a set with components on a cold or distant connection.
    transactionOptions: { timeout: 15_000, maxWait: 5_000 },
  });
}

/**
 * The pg driver already treats sslmode=prefer/require/verify-ca as verify-full (certificate and
 * host checked) and logs a deprecation warning on every cold start. Say verify-full explicitly:
 * identical behaviour, no warning, and it stays strict when pg v9 changes those aliases.
 */
function explicitSslMode(url: string) {
  return url.replace(/([?&])sslmode=(prefer|require|verify-ca)\b/, "$1sslmode=verify-full");
}

const globalForPrisma =globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createPrismaClient();
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
