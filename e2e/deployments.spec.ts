import { expect, test } from "@playwright/test";
import { deploymentPicker, E2E, login, startDeployment, open } from "./fixtures";

// The main day-to-day flow on a phone: no deployment yet → open one → issue and sign a kit →
// next deployment continues from it → the first one is read-only history.
test.describe.configure({ mode: "serial" });

const [soldier] = E2E.soldiers;
const soldierName = soldier[0];

test("without a deployment, kits point to the deployments screen", async ({ page }) => {
  await login(page, E2E.admin);
  await expect(page.getByText("אין הפעלה פעילה — כל הציוד בנשקייה.")).toBeVisible();
  await open(page, "/kits");
  await expect(page.getByText("ערכות אישיות והחתמות נרשמים בתוך הפעלה")).toBeVisible();
});

test("open a deployment, issue kit 1 and sign it", async ({ page }) => {
  await login(page, E2E.admin);
  await startDeployment(page, "הפעלה א", "empty");
  await expect(deploymentPicker(page)).toContainText("הפעלה א (פעילה)");
  await expect(page.getByText("אין הפעלה פעילה").filter({ visible: true })).toHaveCount(0);

  await open(page, "/kits/1");
  await page.locator('select[name="soldierId"]').selectOption({ label: soldierName });
  await page.getByRole("button", { name: "עדכון שיוך" }).click();
  // The form remounts for the new holder (its toast goes with it), so check the kit's status badge.
  await expect(page.getByRole("heading", { name: /ערכה 1/ })).toContainText("טרם הוחתם");

  const helmet = page.getByRole("switch", { name: /קסדה/ });
  await helmet.click();
  await expect(helmet).toHaveAttribute("aria-checked", "true");

  // Draw a signature.
  const pad = page.getByLabel("משטח חתימה");
  await pad.scrollIntoViewIfNeeded(); // below the fold on a phone; mouse coordinates are viewport-relative
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 15, { steps: 8 });
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 15, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "אישור חתימה" }).click();
  await expect(page.getByRole("img", { name: `חתימת ${soldierName}` })).toBeVisible();
});

test("the next deployment continues from it; the first becomes read-only history", async ({ page }) => {
  await login(page, E2E.admin);
  await startDeployment(page, "הפעלה ב", "copy");
  await expect(deploymentPicker(page)).toContainText("הפעלה ב (פעילה)");

  // Kit 1 carried over to the same soldier, with the checklist, but must be signed again.
  await open(page, "/kits/1");
  await expect(page.locator('select[name="soldierId"]')).toContainText(soldierName);
  await expect(page.getByRole("switch", { name: /קסדה/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "אישור חתימה" })).toBeVisible();

  // Look back at the first deployment.
  await deploymentPicker(page).selectOption({ label: "הפעלה א — היסטוריה" });
  await expect(page.getByText("קריאה בלבד.")).toBeVisible();
  await open(page, "/kits/1");
  await expect(page.getByRole("img", { name: `חתימת ${soldierName}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "עדכון שיוך" })).toBeDisabled();
  await expect(page.getByRole("switch", { name: /קסדה/ })).toBeDisabled();

  await page.getByRole("button", { name: "חזרה להפעלה הנוכחית" }).click();
  await expect(page.getByText("קריאה בלבד.").filter({ visible: true })).toHaveCount(0);
  await expect(deploymentPicker(page)).toContainText("הפעלה ב (פעילה)");
});
