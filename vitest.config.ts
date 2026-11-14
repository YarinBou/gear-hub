import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));
const stub = (name: string) => fileURLToPath(new URL(`./test/stubs/${name}`, import.meta.url));

// Two projects:
// - unit:        pure functions, no database. Fast; run on every save.
// - integration: real Postgres (TEST_DATABASE_URL). Runs files one at a time against a shared DB
//                that is wiped between tests. Server actions run with a mocked auth layer.
const alias = {
  "@": src,
  // `server-only` throws outside a React Server environment.
  "server-only": stub("empty.ts"),
};

export default defineConfig({
  test: {
    // Integration files share one database, so files run one at a time.
    fileParallelism: false,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["test/integration/global-setup.ts"],
          setupFiles: ["test/integration/setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
