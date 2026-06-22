import { test, expect } from "@playwright/test";
import { mockStripeCheckoutRoutes } from "../helpers/auth";

test.describe("Public rental application", () => {
  test.beforeEach(async ({ page }) => {
    await mockStripeCheckoutRoutes(page);
  });

  test("apply page loads wizard", async ({ page }) => {
    await page.goto("/rent/apply");
    await expect(page.getByText(/applying as part of a group/i)).toBeVisible({ timeout: 15_000 });
  });
});
