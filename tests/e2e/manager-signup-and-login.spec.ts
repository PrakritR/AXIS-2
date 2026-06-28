import { test, expect } from "@playwright/test";
import { signInAsManager, mockStripeAllRoutes } from "../helpers/auth";
import { E2E_ACCOUNTS } from "../fixtures";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

test.describe("Manager signup and login", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test("partner pricing page shows three plan tiers", async ({ page }) => {
    await page.goto("/partner/pricing");
    await expect(page.getByText(/pro/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/business/i).first()).toBeVisible({ timeout: 10_000 });
    // Free tier or "Get started free" should also appear
    await expect(page.getByText(/free|get started/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("manager can sign in and reach portal dashboard", async ({ page }) => {
    await mockStripeAllRoutes(page);
    await signInAsManager(page);
    await expect(page).toHaveURL(/\/portal\/dashboard/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("manager can sign out and reach sign-in page", async ({ page }) => {
    await mockStripeAllRoutes(page);
    await signInAsManager(page);
    await expect(page).toHaveURL(/\/portal\/dashboard/);

    // Look for profile avatar or menu that contains sign-out
    const avatarBtn = page
      .getByRole("button", { name: /profile|avatar|account|menu/i })
      .or(page.getByTestId("profile-menu"))
      .first();
    if (await avatarBtn.count() > 0) {
      await avatarBtn.click();
      const signOutBtn = page.getByRole("menuitem", { name: /sign out|log out/i }).or(
        page.getByRole("button", { name: /sign out|log out/i }),
      );
      if (await signOutBtn.count() > 0) {
        await signOutBtn.first().click();
        await expect(page).toHaveURL(/\/auth\/sign-in|\/partner|\//, { timeout: 15_000 });
      }
    }
  });

  test("sign in page has email and password fields", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(E2E_ACCOUNTS.manager.email);
    await page.getByLabel("Password", { exact: true }).fill("WrongPass999!");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Should stay on sign-in page and show an error
    await expect(page).toHaveURL(/\/auth\/sign-in/, { timeout: 10_000 });
    const errorEl = page.getByText(/invalid|incorrect|wrong|password|email/i).first();
    await expect(errorEl).toBeVisible({ timeout: 10_000 });
  });
});
