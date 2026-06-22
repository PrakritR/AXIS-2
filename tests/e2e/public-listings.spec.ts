import { test, expect } from "@playwright/test";

test.describe("Public listings", () => {
  test("browse listings page", async ({ page }) => {
    await page.goto("/rent/listings");
    await expect(page).toHaveURL(/\/rent\/listings/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});
