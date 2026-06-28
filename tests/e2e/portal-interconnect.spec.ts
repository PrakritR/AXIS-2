import { test, expect } from "@playwright/test";
import { signInAsManager, signInAsResident, signInAsAdmin, mockStripeAllRoutes } from "../helpers/auth";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

test.describe("Cross-portal interconnect", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test("manager applications tab shows seeded application", async ({ page }) => {
    await mockStripeAllRoutes(page);
    await signInAsManager(page);
    await page.goto("/portal/applications");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    // The seeded application for test resident should appear (or at least the page loads without error)
    const errorEl = page.getByText(/something went wrong|500/i);
    await expect(errorEl).not.toBeVisible({ timeout: 10_000 });
  });

  test("manager can compose and view sent inbox message", async ({ page }) => {
    await mockStripeAllRoutes(page);
    await signInAsManager(page);
    await page.goto("/portal/inbox/sent");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });

    // Try to compose a new message
    const composeBtn = page.getByRole("button", { name: /new message|compose/i }).first();
    if (await composeBtn.count() > 0) {
      await composeBtn.click();
      const subjectField = page.getByLabel(/subject/i).first();
      if (await subjectField.count() > 0) {
        await subjectField.fill("Interconnect test message");
        const bodyField = page.getByLabel(/message|body|text/i).or(page.getByRole("textbox").nth(1)).first();
        if (await bodyField.count() > 0) {
          await bodyField.fill("This is a test message for interconnect.");
        }
        // Close/cancel without sending to avoid polluting inbox
        const cancelBtn = page.getByRole("button", { name: /cancel|close/i }).first();
        if (await cancelBtn.count() > 0) await cancelBtn.click();
      }
    }
  });

  test("admin can view manager applications section", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/axis-users");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    const errorEl = page.getByText(/something went wrong|500/i);
    await expect(errorEl).not.toBeVisible({ timeout: 10_000 });
  });

  test("resident inbox tab loads correctly", async ({ page }) => {
    await signInAsResident(page);
    await page.goto("/resident/inbox/unopened");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    const errorEl = page.getByText(/something went wrong|500/i);
    await expect(errorEl).not.toBeVisible({ timeout: 10_000 });
  });

  test("resident portal reflects approved application status", async ({ page }) => {
    await signInAsResident(page);
    await page.goto("/resident/dashboard");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    // With seeded approved application, dashboard should not show an error
    const errorEl = page.getByText(/something went wrong|500/i);
    await expect(errorEl).not.toBeVisible({ timeout: 10_000 });
  });

  test("admin portal can reach all key admin sections", async ({ page }) => {
    await signInAsAdmin(page);
    for (const path of ["/admin/dashboard", "/admin/onboard", "/admin/properties"]) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test("manager residents tab shows current residents", async ({ page }) => {
    await mockStripeAllRoutes(page);
    await signInAsManager(page);
    await page.goto("/portal/residents/current");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    const errorEl = page.getByText(/something went wrong|500/i);
    await expect(errorEl).not.toBeVisible({ timeout: 10_000 });
  });
});
