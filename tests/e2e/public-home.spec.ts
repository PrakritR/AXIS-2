import { test, expect } from "@playwright/test";

test.describe("Public home", () => {
  test("loads landing with dual CTAs and no search form", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /run and fill your properties/i })).toBeVisible();
    await expect(page.getByText(/property management, simplified/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /find a room/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /partner with axis/i }).first()).toBeVisible();
    await expect(page.getByLabel(/move-in date/i)).toHaveCount(0);
  });

  test("hero CTAs navigate to rent and partner", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /find a room/i }).first().click();
    await expect(page).toHaveURL(/\/rent\/listings/);
    await page.goto("/");
    await page.getByRole("link", { name: /partner with axis/i }).first().click();
    await expect(page).toHaveURL(/\/partner/);
  });
});
