import { test, expect } from "@playwright/test";

const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

test.describe("Manager FREE100 signup", () => {
  test.skip(!hasSupabase, "Requires Supabase test project");

  test("pro signup with FREE100 waiver", async ({ page }) => {
    const uniqueEmail = `mgr-e2e-${Date.now()}@test.axis.local`;
    await page.goto("/partner/pricing");

    await page.getByRole("button", { name: /pro/i }).first().click();
    const promoInput = page.getByPlaceholder(/promo|code/i).or(page.getByLabel(/promo/i));
    if (await promoInput.count()) {
      await promoInput.first().fill("FREE100");
    }

    await page.getByLabel(/email/i).fill(uniqueEmail);
    await page.getByLabel(/full name/i).fill("E2E Test Manager");
    await page.getByRole("button", { name: /continue with pro/i }).click();

    await page.waitForURL(/create-account|manager-id|portal/, { timeout: 30_000 });
    expect(page.url()).toMatch(/create-account|manager-id|portal/);
  });
});
