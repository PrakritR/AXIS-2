import { test, expect } from "@playwright/test";
import { signInAsManager } from "../helpers/auth";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

test.describe("Manager portal", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await signInAsManager(page);
  });

  test("dashboard loads", async ({ page }) => {
    await page.goto("/portal/dashboard");
    await expect(page).toHaveURL(/\/portal\/dashboard/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("properties section loads", async ({ page }) => {
    await page.goto("/portal/properties");
    await expect(page).toHaveURL(/\/portal\/properties/);
  });

  test("applications section loads", async ({ page }) => {
    await page.goto("/portal/applications");
    await expect(page).toHaveURL(/\/portal\/applications/);
  });
});
