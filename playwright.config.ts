import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Browser end-to-end tests (e2e/). They run a production build (`next build && next start`)
// against the marked TEST database (TEST_DATABASE_URL in .env.test), which e2e/global-setup.ts
// migrates, empties and seeds before the run. Run with: npm run test:e2e
config({ path: ".env.test", quiet: true });

const PORT = 3100;
const testDb = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One shared database: run flows one after another.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "he-IL",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: testDb,
      SESSION_SECRET: process.env.E2E_SESSION_SECRET ?? "e2e-session-secret-e2e-session-secret-0123",
    },
  },
});
