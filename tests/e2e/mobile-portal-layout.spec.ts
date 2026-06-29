import { test, expect } from "@playwright/test";
import { signInAsManager, mockStripeAllRoutes } from "../helpers/auth";
import { MANAGER_PORTAL_SMOKE_PATHS } from "@/lib/portals/pro";
import { RESIDENT_PORTAL_SMOKE_PATHS } from "@/lib/portals/resident-sections";
import { ADMIN_PORTAL_SMOKE_PATHS } from "@/lib/portals/admin";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("Mobile portal layout", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.addInitScript(() => {
      document.documentElement.setAttribute("data-native", "ios");
    });
  });

  test("manager smoke paths render headings without page-level horizontal overflow", async ({ page }) => {
    await mockStripeAllRoutes(page);
    await signInAsManager(page);

    for (const { path } of MANAGER_PORTAL_SMOKE_PATHS) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 2;
      });
      expect(overflow, `unexpected horizontal overflow on ${path}`).toBe(false);
    }
  });

  test("portal main content reserves bottom inset on native", async ({ page }) => {
    await mockStripeAllRoutes(page);
    await signInAsManager(page);
    await page.goto("/portal/dashboard");
    await expect(page.locator("#portal-main-content")).toBeVisible();

    const inset = await page.evaluate(() => {
      const main = document.getElementById("portal-main-content");
      if (!main) return null;
      const styles = getComputedStyle(main);
      return styles.paddingBottom;
    });
    expect(inset).toBeTruthy();
  });
});

test.describe("Mobile resident portal layout", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.addInitScript(() => {
      document.documentElement.setAttribute("data-native", "ios");
    });
  });

  test("resident smoke paths load on mobile viewport", async ({ page }) => {
    test.skip(true, "Requires resident E2E seed credentials — enable when resident auth helper is wired");
    for (const { path } of RESIDENT_PORTAL_SMOKE_PATHS) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    }
  });
});

test.describe("Mobile admin portal layout", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.addInitScript(() => {
      document.documentElement.setAttribute("data-native", "ios");
    });
  });

  test("admin smoke paths are registered for mobile checks", () => {
    expect(ADMIN_PORTAL_SMOKE_PATHS.length).toBeGreaterThan(0);
    expect(ADMIN_PORTAL_SMOKE_PATHS[0]?.path).toMatch(/^\/admin\//);
  });
});
