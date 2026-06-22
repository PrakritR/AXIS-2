import { test, expect } from "@playwright/test";

test.describe("Public partner", () => {
  test("loads partner landing with hero and CTAs", async ({ page }) => {
    await page.goto("/partner");
    await expect(page.getByRole("heading", { name: /we manage your property/i })).toBeVisible();
    await expect(page.getByText(/axis housing · partner program/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /book a consultation/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /use our software/i })).toBeVisible();
    await expect(page.getByText(/properties managed/i)).toBeVisible();
  });
});
