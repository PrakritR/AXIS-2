import { test, expect } from "@playwright/test";

test.describe("Public tours", () => {
  test("tours contact page loads", async ({ page }) => {
    await page.goto("/rent/tours-contact");
    await expect(page).toHaveURL(/tours/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});
