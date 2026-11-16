import { expect, test } from "@playwright/test";
import { E2E, login, open } from "./fixtures";

// Light / dark: the app follows the device until the user picks a theme on "עוד"; the choice is
// kept on the device (localStorage) and applied before first paint on the next load.

test("theme follows the device, and a manual choice survives a reload", async ({ page }) => {
  const html = page.locator("html");

  await page.emulateMedia({ colorScheme: "dark" });
  await login(page, E2E.admin);
  await open(page, "/more");
  await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(page.getByRole("radio", { name: "אוטומטי" })).toBeChecked();

  // Pick light on a dark device.
  await page.getByRole("radio", { name: "בהיר" }).click();
  await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await open(page, "/");
  await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);

  // Pick dark on a light device.
  await page.emulateMedia({ colorScheme: "light" });
  await open(page, "/more");
  await expect(page.getByRole("radio", { name: "בהיר" })).toBeChecked();
  await page.getByRole("radio", { name: "כהה" }).click();
  await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  await page.reload({ waitUntil: "networkidle" });
  await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);

  // Back to automatic: follows the (light) device again.
  await page.getByRole("radio", { name: "אוטומטי" }).click();
  await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
});

test("pages print on white even in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await login(page, E2E.admin);
  await open(page, "/more");
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);

  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(255, 255, 255)");
});
