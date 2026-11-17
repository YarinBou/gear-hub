import { expect, test } from "@playwright/test";
import { E2E, login, open } from "./fixtures";

// The dashboard answers "what needs my attention?" first. On a phone (this suite runs as Pixel 7)
// the page opens with that section, then the company in five rows; the 98-kit map is desktop-only.

test("phone dashboard leads with what needs attention", async ({ page }) => {
  await login(page, E2E.admin);
  await open(page, "/");

  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText(/טיפול/);

  // Attention comes before the company summary in reading order.
  const headings = await page.getByRole("heading").allInnerTexts();
  expect(headings.indexOf(await h1.innerText())).toBeLessThan(headings.indexOf("מצב הפלוגה"));

  // One tappable row per module, each a full 44px target.
  const status = page.getByRole("region", { name: "מצב הפלוגה" });
  for (const [name, href] of [
    ['סד"כ', "/roster"],
    ['צל"ם', "/equipment"],
    ["ערכות", "/kits"],
    ["תחמושת", "/ammo"],
    ['בימ"ח', "/storage"],
  ] as const) {
    const link = status.getByRole("link", { name: new RegExp(`^${name}`) });
    await expect(link).toHaveAttribute("href", href);
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  // The kit map is not on the phone dashboard.
  await expect(page.getByRole("list", { name: "מפת ערכות" })).toBeHidden();
});
