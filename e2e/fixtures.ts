import { expect, type Page } from "@playwright/test";

/** What e2e/global-setup.ts seeds. */
export const E2E = {
  company: "פלוגת בדיקה",
  admin: "e2e-admin",
  superAdmin: "e2e-super",
  password: "E2e-password-123",
  soldiers: [
    ["ישראל ישראלי", "מחלקה 1"],
    ["דנה כהן", "מחלקה 2"],
  ] as const,
  rifleSerial: "77001",
};

export async function login(page: Page, username: string, password = E2E.password) {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "networkidle" });
  // The form streams in and hydrates; text typed before that is wiped. Retry until it goes through.
  // (:visible — while streaming, the loading placeholder form is also in the DOM.)
  await expect(async () => {
    await page.locator("#username:visible").fill(username);
    await page.locator("#password:visible").fill(password);
    await page.getByRole("button", { name: "התחברות" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
}

/** Open a page and wait until it is hydrated — clicks before that hit plain HTML forms. */
export async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "networkidle" });
}

/** The header's deployment picker. */
export function deploymentPicker(page: Page) {
  return page.getByRole("banner").getByLabel("הפעלה מוצגת");
}

/** Start a deployment from /deployments. */
export async function startDeployment(page: Page, name: string, mode: "copy" | "empty") {
  await open(page, "/deployments");
  await page.getByRole("button", { name: "פתיחת הפעלה חדשה" }).click();
  await page.getByLabel("שם ההפעלה").fill(name);
  await page.getByText(mode === "copy" ? /^להמשיך מ/ : "להתחיל נקי", { exact: mode !== "copy" }).click();
  await page.getByRole("button", { name: "פתיחת ההפעלה" }).click();
  // Creates the company's kits (98 by default) with their checklists; slow from a laptop to the cloud test database.
  await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
}
