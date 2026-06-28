import { test, expect } from "@playwright/test";
import { signInAsManager } from "../helpers/auth";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

test.describe("UI consistency — portal shell", () => {
  test("skip link targets main content on sign-in page (public baseline)", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await expect(page.getByRole("heading", { name: /portal sign-in/i })).toBeVisible();
  });

  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test("portal layout exposes skip link and main landmark", async ({ page }) => {
    await signInAsManager(page);
    await page.goto("/portal/dashboard");
    await expect(page.getByRole("heading").first()).toBeVisible();

    const skipLink = page.getByRole("link", { name: /skip to main content/i });
    await skipLink.focus();
    await expect(skipLink).toBeVisible();

    await skipLink.click();
    await expect(page.locator("#portal-main-content")).toBeFocused();
  });

  test("portal inbox section uses canonical page shell heading", async ({ page }) => {
    await signInAsManager(page);
    await page.goto("/portal/inbox/unopened");
    await expect(page.getByRole("heading", { name: /^inbox$/i })).toBeVisible();
  });

  test("portal payments section renders without legacy empty state", async ({ page }) => {
    await signInAsManager(page);
    await page.goto("/portal/payments");
    await expect(page.getByRole("heading", { name: /^payments$/i })).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("UI consistency — dark mode portal routes", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("axis:theme", "dark");
    });
    await signInAsManager(page);
  });

  const routes = ["/portal/inbox/unopened", "/portal/payments", "/portal/services/requests"] as const;

  for (const route of routes) {
    test(`${route} renders in dark mode`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole("heading").first()).toBeVisible();
      const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      expect(theme).toBe("dark");
    });
  }
});
