import { test, expect } from "@playwright/test";

test.describe("Public rental application gate", () => {
  test("unauthenticated apply link redirects to resident signup", async ({ page }) => {
    await page.goto("/rent/apply?propertyId=test-property");
    await expect(page).toHaveURL(/\/auth\/create-account\?.*role=resident/, { timeout: 15_000 });
    await expect(page.url()).toContain(encodeURIComponent("/resident/applications/apply"));
  });
});
