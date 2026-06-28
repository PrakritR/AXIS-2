import { test, expect } from "@playwright/test";

test.describe("Public home", () => {
  test("loads landing with partner CTA and no search form", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /AI-powered property management/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /partner with axis/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /find a room/i })).toHaveCount(0);
    await expect(page.getByLabel(/move-in date/i)).toHaveCount(0);
  });

  test("hero CTA navigates to partner", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /partner with axis/i }).first().click();
    await expect(page).toHaveURL(/\/partner/);
  });
});
