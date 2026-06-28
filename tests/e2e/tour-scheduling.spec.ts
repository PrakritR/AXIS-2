import { test, expect } from "@playwright/test";
import { signInAsManager } from "../helpers/auth";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

test.describe("Tour scheduling", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test("tours-contact page loads with form fields", async ({ page }) => {
    await page.goto("/rent/tours-contact");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    // Should have input fields for contact info
    const inputs = page.getByRole("textbox");
    await expect(inputs.first()).toBeVisible({ timeout: 10_000 });
    // Submit button present
    const submitBtn = page.getByRole("button", { name: /submit|send|request|schedule/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
  });

  test("tours-contact page has message or topic input", async ({ page }) => {
    await page.goto("/rent/tours-contact");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    // Message textarea or topic select
    const textarea = page.getByRole("textbox").last();
    await expect(textarea).toBeVisible({ timeout: 10_000 });
  });

  test("manager calendar page shows calendar controls", async ({ page }) => {
    await signInAsManager(page);
    await page.goto("/portal/calendar");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    // Calendar navigation buttons (today, month, week)
    const calControls = page.getByRole("button", { name: /today|month|week|day/i }).first();
    await expect(calControls).toBeVisible({ timeout: 10_000 });
  });

  test("manager calendar shows upcoming events section", async ({ page }) => {
    await signInAsManager(page);
    await page.goto("/portal/calendar");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    // Calendar grid or schedule view should be present
    const calEl = page
      .locator("table, .calendar, .fc, [data-testid='calendar']")
      .or(page.getByText(/schedule|upcoming|tour/i))
      .first();
    await expect(calEl).toBeVisible({ timeout: 15_000 });
  });

  test("public tours page renders", async ({ page }) => {
    await page.goto("/rent/tours-contact");
    // Should not crash
    const errorEl = page.getByText(/something went wrong|500/i);
    await expect(errorEl).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});
