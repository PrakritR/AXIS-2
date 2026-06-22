import { test, expect } from "@playwright/test";
import { signInAsResident } from "../helpers/auth";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

test.describe("Resident portal", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await signInAsResident(page);
  });

  test("dashboard loads", async ({ page }) => {
    await page.goto("/resident/dashboard");
    await expect(page).toHaveURL(/\/resident\/dashboard/);
  });

  test("payments section loads", async ({ page }) => {
    await page.goto("/resident/payments");
    await expect(page).toHaveURL(/\/resident\/payments/);
  });
});
