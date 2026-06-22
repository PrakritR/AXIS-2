import { test, expect } from "@playwright/test";

const hasFullEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.E2E_MANAGER_EMAIL &&
    process.env.E2E_RESIDENT_EMAIL,
);

test.describe("Full lifecycle smoke", () => {
  test.skip(!hasFullEnv, "Requires full E2E seed environment");

  test("public can reach apply flow from listings", async ({ page }) => {
    await page.goto("/rent/listings");
    await expect(page).toHaveURL(/\/rent\/listings/);
    await page.goto("/rent/apply");
    await expect(page).toHaveURL(/\/rent\/apply/);
    await expect(page.getByText(/applying as part of a group/i)).toBeVisible({ timeout: 15_000 });
  });
});
