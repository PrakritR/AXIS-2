import { test, expect } from "@playwright/test";

test.describe("Public home", () => {
  test("loads home page with hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /find a room/i })).toBeVisible();
    await expect(page.getByText(/axis · rooms for rent/i)).toBeVisible();
  });
});
