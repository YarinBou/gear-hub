import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations / introspection use the DIRECT (non-pooled) connection.
// The app runtime uses DATABASE_URL (pooled) via src/lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // DATABASE_URL_UNPOOLED is what the Neon ↔ Vercel integration provides at build time.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    // Optional: only needed when the server cannot create a temporary shadow DB (e.g. `prisma dev`).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
