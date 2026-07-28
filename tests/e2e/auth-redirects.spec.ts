import { test, expect } from "@playwright/test";

test.describe("Auth redirects", () => {
  test("protected portal redirects to sign-in", async ({ page }) => {
    await page.goto("/portal/dashboard");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  test("legacy manager path redirects to portal", async ({ page }) => {
    await page.goto("/manager/properties");
    await expect(page).toHaveURL(/\/portal\/properties|\/auth\/sign-in/);
  });

  test("sign-in page loads", async ({ page }) => {
    await page.goto("/auth/sign-in");
    // The unified auth hub (NativeAuthHub) renders label-less inputs (placeholder
    // only), matching tests/helpers/auth.ts — never a <label>, so getByLabel finds
    // nothing here.
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });
});
