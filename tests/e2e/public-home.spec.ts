import { test, expect } from "@playwright/test";

test.describe("Public home", () => {
  test("loads the demo-first landing hero and CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /leases sign themselves/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /get started for free/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /book a demo/i }).first()).toBeVisible();
  });

  test("scroll cue targets the embedded live demo", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#live-demo")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /try the live demo/i }).first()).toHaveAttribute(
      "href",
      "#live-demo",
    );
  });
});
