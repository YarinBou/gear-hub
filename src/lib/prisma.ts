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
  const adapter = new PrismaPg({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

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
