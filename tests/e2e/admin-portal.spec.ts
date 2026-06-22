import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "../helpers/auth";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

test.describe("Admin portal", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("dashboard loads", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("axis users section loads", async ({ page }) => {
    await page.goto("/admin/axis-users");
    await expect(page).toHaveURL(/\/admin\/axis-users/);
  });
});
