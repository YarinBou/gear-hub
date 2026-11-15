import { expect, test } from "@playwright/test";
import { E2E, login, open } from "./fixtures";

// The super-admin creates a company; its new admin signs in to an empty company that can't see
// anything of the seeded one.
test.describe.configure({ mode: "serial" });

const NEW_COMPANY = "פלוגה חדשה בדיקה";
const NEW_ADMIN = "e2e-newadmin";
let tempPassword = "";

test("super-admin creates a company and works inside it", async ({ page }) => {
  await login(page, E2E.superAdmin);
  await expect(page).toHaveURL(/\/admin\/companies/);

  await page.getByRole("button", { name: "פלוגה חדשה" }).click();
  await page.locator("#company-name").fill(NEW_COMPANY);
  await page.locator("#admin-name").fill("מ\"פ חדש");
  await page.locator("#admin-username").fill(NEW_ADMIN);
  await page.getByRole("button", { name: "יצירת פלוגה" }).click();

  const shown = page.getByRole("status").filter({ hasText: "סיסמה זמנית" });
  await expect(shown).toBeVisible();
  tempPassword = (await shown.locator(".font-mono").last().innerText()).trim();
  expect(tempPassword.length).toBeGreaterThanOrEqual(8);

  const row = page.getByRole("listitem").filter({ hasText: NEW_COMPANY });
  await row.getByRole("button", { name: "כניסה לפלוגה" }).click();
  await expect(page.getByRole("banner").getByTitle("החלפת פלוגה")).toContainText(NEW_COMPANY);

  // A brand-new company: none of the seeded company's soldiers.
  await open(page, "/roster");
  await expect(page.getByText(E2E.soldiers[0][0]).filter({ visible: true })).toHaveCount(0);
});

test("the new company's admin signs in with the temporary password", async ({ page }) => {
  expect(tempPassword).not.toBe("");
  await login(page, NEW_ADMIN, tempPassword);
  await expect(page.getByRole("banner")).toContainText(NEW_COMPANY);
  await expect(page.getByText("אין הפעלה פעילה — כל הציוד בנשקייה.")).toBeVisible();

  // The seeded company's rifle doesn't exist here.
  await open(page, `/search?q=${E2E.rifleSerial}`);
  await expect(page.getByText(`לא נמצאו תוצאות עבור "${E2E.rifleSerial}"`)).toBeVisible();
});
