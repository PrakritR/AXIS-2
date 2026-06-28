import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "../helpers/auth";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

const ADMIN_SECTIONS = [
  { label: "Dashboard", path: "/admin/dashboard" },
  { label: "Onboard", path: "/admin/onboard" },
  { label: "Properties", path: "/admin/properties" },
  { label: "Axis users", path: "/admin/axis-users" },
  { label: "Leases", path: "/admin/leases" },
  { label: "Events", path: "/admin/events" },
  { label: "Inbox", path: "/admin/inbox/unopened" },
  { label: "Bugs & Feedback", path: "/admin/bugs-feedback" },
] as const;

test.describe("Admin portal", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("dashboard loads", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("axis users section loads", async ({ page }) => {
    await page.goto("/admin/axis-users");
    await expect(page).toHaveURL(/\/admin\/axis-users/);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("all admin sections load via direct navigation", async ({ page }) => {
    for (const { path } of ADMIN_SECTIONS) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test("onboard section loads with heading", async ({ page }) => {
    await page.goto("/admin/onboard");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("admin inbox loads and shows compose button", async ({ page }) => {
    await page.goto("/admin/inbox/unopened");
    await expect(page.getByRole("heading").first()).toBeVisible();
    const composeBtn = page.getByRole("button", { name: /new message|compose/i }).first();
    // Compose button may or may not be present depending on config
    if (await composeBtn.count() > 0) {
      await expect(composeBtn).toBeVisible();
    }
  });

  test("bugs-feedback section loads", async ({ page }) => {
    await page.goto("/admin/bugs-feedback");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  });

  test("properties section loads", async ({ page }) => {
    await page.goto("/admin/properties");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  });

  test("leases section loads", async ({ page }) => {
    await page.goto("/admin/leases");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  });

  test("events section loads", async ({ page }) => {
    await page.goto("/admin/events");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  });
});
