import { test, expect } from "@playwright/test";
import { signInAsManager } from "../helpers/auth";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

const PAID_MANAGER_NAV = [
  { label: "Dashboard", path: "/portal/dashboard" },
  { label: "Properties", path: "/portal/properties" },
  { label: "Tours", path: "/portal/calendar" },
  { label: "Applications", path: "/portal/applications" },
  { label: "Residents", path: "/portal/residents/current" },
  { label: "Leases", path: "/portal/leases" },
  { label: "Payments", path: "/portal/payments" },
  { label: "Services", path: "/portal/services/requests" },
  { label: "Inbox", path: "/portal/inbox/unopened" },
  { label: "Feedback", path: "/portal/bugs-feedback" },
  { label: "Co-managers", path: "/portal/relationships" },
  { label: "Plan", path: "/portal/plan" },
  { label: "Profile", path: "/portal/profile" },
] as const;

test.describe("Manager portal", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await signInAsManager(page);
  });

  test("dashboard loads", async ({ page }) => {
    await expect(page).toHaveURL(/\/portal\/dashboard/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("all manager sections load via direct navigation", async ({ page }) => {
    for (const { path } of PAID_MANAGER_NAV) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}`));
      await expect(page.getByRole("heading").first()).toBeVisible();
    }
  });

  test("legacy manager and work-orders paths redirect", async ({ page }) => {
    await page.goto("/manager/properties");
    await expect(page).toHaveURL(/\/portal\/properties/, { timeout: 15_000 });

    await page.goto("/portal/work-orders");
    await expect(page).toHaveURL(/\/portal\/services\/work-orders/, { timeout: 15_000 });
  });
});
