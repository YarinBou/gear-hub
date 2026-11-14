import { config } from "dotenv";
import { afterAll, beforeEach, vi } from "vitest";
import { testDatabaseUrl } from "./test-db";

// Runs in every integration test file before it imports app code.

config({ path: ".env.test", override: true, quiet: true });
// src/lib/prisma.ts reads DATABASE_URL lazily on first use.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123";

// ── Next.js runtime APIs that only work inside a request ──

vi.mock("next/cache", () => ({
  cacheTag: () => {},
  cacheLife: () => {},
  refresh: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

// The real auth layer runs; it reads cookies from the test jar (see auth-mock.ts).
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("./auth-mock");
  return {
    cookies: async () => cookieStore,
    headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
  };
});

vi.mock("next/navigation", async () => {
  const { RedirectSignal } = await import("./auth-mock");
  return {
    redirect: (url: string) => {
      throw new RedirectSignal(url);
    },
    notFound: () => {
      throw new RedirectSignal("/404");
    },
  };
});

// ── Clean slate before every test ──

beforeEach(async () => {
  const { resetDatabase } = await import("./db");
  await resetDatabase();
  const { signOut } = await import("./auth-mock");
  signOut();
  const { resetFactories } = await import("./factories");
  resetFactories();
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
});
