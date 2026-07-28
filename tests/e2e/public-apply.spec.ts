import { test, expect } from "@playwright/test";

test.describe("Public rental application gate", () => {
  test("known property shows resident signup gate with guest path", async ({ page }) => {
    await page.goto("/rent/apply?propertyId=mgr-test-fir");
    await expect(page.getByRole("heading", { name: /create your resident account/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: /create account/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue without an account/i })).toBeVisible();
  });

  test("guest can continue into the apply wizard", async ({ page }) => {
    await page.goto("/rent/apply?propertyId=mgr-test-fir");
    await page.getByRole("button", { name: /continue without an account/i }).click();
    await expect(page.getByRole("heading", { name: /rental application/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /^continue$/i })).toBeVisible();
  });
});
