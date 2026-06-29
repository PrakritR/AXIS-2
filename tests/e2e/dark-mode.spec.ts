import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin, signInAsManager, signInAsResident } from "../helpers/auth";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

/** Force dark theme before any page script runs. */
async function enableDarkMode(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("axis:theme", "dark");
  });
}

/** Returns count of large content panels whose computed background is near-white (RGB all > 235). */
async function countBrightBackgrounds(page: Page, rootSelector = "main") {
  return page.locator(rootSelector).evaluate((root) => {
    const isBright = (bg: string) => {
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return false;
      const r = Number(m[1]);
      const g = Number(m[2]);
      const b = Number(m[3]);
      const a = m[4] !== undefined ? Number(m[4]) : 1;
      // Ignore translucent glass surfaces — only flag opaque near-white panels.
      if (a < 0.85) return false;
      return r > 235 && g > 235 && b > 235;
    };

    const nodes = root.querySelectorAll("div, section, article, aside");
    let count = 0;
    nodes.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const style = getComputedStyle(htmlEl);
      if (style.display === "none" || style.visibility === "hidden") return;
      const rect = htmlEl.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 60) return;
      if (htmlEl.closest("button, nav, footer, header")) return;
      if (isBright(style.backgroundColor)) count += 1;
    });
    return count;
  });
}

async function assertDarkThemeActive(page: Page) {
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  expect(theme).toBe("dark");
}

async function assertMainContentNotLightThemed(page: Page, maxBright = 2) {
  await assertDarkThemeActive(page);
  const bright = await countBrightBackgrounds(page);
  expect(bright).toBeLessThanOrEqual(maxBright);
}

test.describe("Dark mode — public surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await enableDarkMode(page);
  });

  test("marketing home uses dark theme without bright content panels", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /run and fill your properties/i })).toBeVisible();
    await assertMainContentNotLightThemed(page, 0);
  });

  test("auth sign-in card respects dark theme", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await expect(page.getByRole("heading", { name: /portal sign-in/i })).toBeVisible();
    await assertDarkThemeActive(page);
    const cardBg = await page.locator(".glass-card").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(cardBg).not.toMatch(/rgb\(255,\s*255,\s*255/);
  });

  test("auth create-account labels and callouts are readable in dark mode", async ({ page }) => {
    await page.goto("/auth/create-account");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
    await assertDarkThemeActive(page);

    const portalTypeLabel = page.getByText("Portal type", { exact: true });
    await expect(portalTypeLabel).toBeVisible();
    const labelColor = await portalTypeLabel.evaluate((el) => getComputedStyle(el).color);
    expect(labelColor).not.toMatch(/rgb\(51,\s*65,\s*85\)/);

    const infoCallout = page.locator(".portal-banner-neutral").first();
    await expect(infoCallout).toBeVisible();
    const calloutStyle = await infoCallout.evaluate((el) => {
      const style = getComputedStyle(el);
      return { color: style.color, backgroundColor: style.backgroundColor };
    });
    expect(calloutStyle.backgroundColor).not.toMatch(/rgb\(248,\s*250,\s*252\)/);

    await assertMainContentNotLightThemed(page, 0);
  });

  test("partner page respects dark theme", async ({ page }) => {
    await page.goto("/partner");
    await assertMainContentNotLightThemed(page, 0);
  });
});

test.describe("Dark mode — property portal", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await enableDarkMode(page);
    await signInAsManager(page);
  });

  const routes = [
    "/portal/dashboard",
    "/portal/properties",
    "/portal/applications",
    "/portal/calendar",
    "/portal/profile",
  ] as const;

  for (const route of routes) {
    test(`${route} has no light-themed main content`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await assertMainContentNotLightThemed(page, 0);
    });
  }
});

test.describe("Dark mode — resident portal", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await enableDarkMode(page);
    await signInAsResident(page);
  });

  const routes = ["/resident/dashboard", "/resident/documents/lease", "/resident/payments"] as const;

  for (const route of routes) {
    test(`${route} has no light-themed main content`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await assertMainContentNotLightThemed(page, 0);
    });
  }
});

test.describe("Dark mode — admin portal", () => {
  test.skip(!portalTestsEnabled, "Set E2E_TESTS_ENABLED=1 after running npm run test:seed");

  test.beforeEach(async ({ page }) => {
    await enableDarkMode(page);
    await signInAsAdmin(page);
  });

  const routes = ["/admin/dashboard", "/admin/properties", "/admin/axis-users", "/admin/events", "/admin/inbox"] as const;

  for (const route of routes) {
    test(`${route} has no light-themed main content`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await assertMainContentNotLightThemed(page, 0);
    });
  }
});
