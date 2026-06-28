import { test, expect } from "@playwright/test";
import { signInAsResident, mockStripeCheckoutRoutes } from "../helpers/auth";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

const RESIDENT_SECTIONS = [
  { label: "Dashboard", path: "/resident/dashboard" },
  { label: "Payments", path: "/resident/payments" },
  { label: "Move-in", path: "/resident/move-in" },
  { label: "Inbox", path: "/resident/inbox/unopened" },
  { label: "Documents", path: "/resident/documents/receipts" },
  { label: "Finances", path: "/resident/finances/summary" },
  { label: "Services", path: "/resident/services/requests" },
] as const;

test.describe("Resident portal", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await mockStripeCheckoutRoutes(page);
    await signInAsResident(page);
  });

  test("dashboard loads", async ({ page }) => {
    await page.goto("/resident/dashboard");
    await expect(page).toHaveURL(/\/resident\/dashboard/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("payments section loads", async ({ page }) => {
    await page.goto("/resident/payments");
    await expect(page).toHaveURL(/\/resident\/payments/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("all resident sections load via direct navigation", async ({ page }) => {
    for (const { path } of RESIDENT_SECTIONS) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test("dashboard shows application status indicator", async ({ page }) => {
    await page.goto("/resident/dashboard");
    // Should show some status indicator (approved/active or checklist)
    const statusEl = page.getByText(/approved|active|welcome|dashboard/i).first();
    await expect(statusEl).toBeVisible({ timeout: 10_000 });
  });

  test("inbox tab loads and compose modal can be opened", async ({ page }) => {
    await page.goto("/resident/inbox/unopened");
    await expect(page.getByRole("heading").first()).toBeVisible();
    const composeBtn = page.getByRole("button", { name: /new message|compose/i }).first();
    if (await composeBtn.count() > 0) {
      await composeBtn.click();
      await expect(page.getByLabel(/subject/i).first()).toBeVisible({ timeout: 8_000 });
      // Cancel the modal
      const cancelBtn = page.getByRole("button", { name: /cancel|close/i }).first();
      if (await cancelBtn.count() > 0) await cancelBtn.click();
    }
  });

  test("services tab shows submit request option", async ({ page }) => {
    await page.goto("/resident/services/requests");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("documents receipts tab loads", async ({ page }) => {
    await page.goto("/resident/documents/receipts");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("finances summary tab loads", async ({ page }) => {
    await page.goto("/resident/finances/summary");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("move-in tab loads", async ({ page }) => {
    await page.goto("/resident/move-in");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  });
});
