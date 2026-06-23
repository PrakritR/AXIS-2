import { test, expect } from "@playwright/test";

test.describe("Public listings", () => {
  test("browse listings page with search hero", async ({ page }) => {
    await page.goto("/rent/listings");
    await expect(page).toHaveURL(/\/rent\/listings/);
    await expect(page.getByRole("heading", { name: /find your next room/i })).toBeVisible();
    await expect(page.getByText("Move-in date", { exact: true })).toBeVisible();
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /available properties/i })).toBeVisible();
  });
});
