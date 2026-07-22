import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Promotion UX: the type filter reads Text | Image (no "All"), and "New
 * promotion" drops straight into the picked type's form inside one modal —
 * no intermediate "Continue" step.
 *
 * Driven through /demo, which mounts the real <ManagerPromotion /> panel with
 * seeded rows and needs no auth or Supabase.
 */

const HEADLINE_PLACEHOLDER = "Modern living in the heart of the city";

const SHOT_DIR = process.env.PROMOTION_SHOT_DIR ?? path.resolve(".playwright-shots");

function headlineInput(scope: ReturnType<Page["getByRole"]>) {
  return scope.getByPlaceholder(HEADLINE_PLACEHOLDER);
}

async function openPromotionSection(page: Page) {
  // Returns the demo portal frame so screenshots crop to the portal UI.
  await page.goto("/demo");
  // The demo ships both a desktop sidebar and a mobile section strip; only one
  // is visible at a given viewport.
  await page.locator('[data-attr="demo-nav-promotion"]:visible').first().click();
  await expect(page.getByRole("heading", { name: "Promotion", exact: true })).toBeVisible();
  await expect(page.locator('[data-attr="promotion-filter-text"]')).toBeVisible();
  // Land on the top of the panel so screenshots frame the filter row.
  await page.evaluate(() => {
    document.getElementById("demo-portal-scroll")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  });
  return page.locator(".demo-portal-frame");
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test.describe(`Promotion UX (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("type filter has no All pill and defaults to Text", async ({ page }) => {
      const frame = await openPromotionSection(page);

      await expect(page.locator('[data-attr="promotion-filter-all"]')).toHaveCount(0);
      const pills = page.locator(
        '[data-attr="promotion-filter-text"], [data-attr="promotion-filter-image"]',
      );
      await expect(pills).toHaveCount(2);

      const text = page.locator('[data-attr="promotion-filter-text"]');
      const image = page.locator('[data-attr="promotion-filter-image"]');
      // Active pill = white card chip (ManagerPortalStatusPills).
      await expect(text).toHaveClass(/bg-card/);
      await expect(image).not.toHaveClass(/bg-card/);

      await frame.screenshot({
        path: `${SHOT_DIR}/${viewport.name}-01-filter-pills-text.png`,
      });

      await image.click();
      await expect(image).toHaveClass(/bg-card/);
      await expect(text).not.toHaveClass(/bg-card/);
      await frame.screenshot({
        path: `${SHOT_DIR}/${viewport.name}-02-filter-pills-image.png`,
      });
    });

    test("New promotion opens one modal whose dropdown swaps the form inline", async ({ page }) => {
      await openPromotionSection(page);
      await page.locator('[data-attr="promotion-new"]').click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("New promotion", { exact: true })).toBeVisible();

      // No intermediate step: the flyer form is already there.
      await expect(dialog.getByRole("button", { name: /^continue$/i })).toHaveCount(0);
      const kind = dialog.locator('[data-attr="promotion-new-kind"]');
      await expect(kind).toHaveValue("flyer");
      await expect(headlineInput(dialog)).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Generate flyer" })).toBeVisible();
      await dialog.screenshot({
        path: `${SHOT_DIR}/${viewport.name}-03-new-modal-flyer.png`,
      });

      // Picking "Text" swaps the body in place — same modal, still titled
      // "New promotion", no Continue.
      await kind.selectOption("text");
      await expect(dialog.getByText("New promotion", { exact: true })).toBeVisible();
      await expect(dialog.locator("#promotion-text-format")).toBeVisible();
      await expect(headlineInput(dialog)).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: /^continue$/i })).toHaveCount(0);
      await dialog.screenshot({
        path: `${SHOT_DIR}/${viewport.name}-04-new-modal-text.png`,
      });

      // Cancel still closes it.
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("switching type after entering content warns before discarding", async ({ page }) => {
      await openPromotionSection(page);
      await page.locator('[data-attr="promotion-new"]').click();
      const dialog = page.getByRole("dialog");
      const kind = dialog.locator('[data-attr="promotion-new-kind"]');

      await headlineInput(dialog).fill("Sunlit 2BR — first month free");
      await dialog.screenshot({
        path: `${SHOT_DIR}/${viewport.name}-05-flyer-content-entered.png`,
      });

      // Dismissing the warning keeps the flyer form and the typed content.
      const dismissed = page.waitForEvent("dialog").then(async (d) => {
        const message = d.message();
        await d.dismiss();
        return message;
      });
      await kind.selectOption("text");
      const message = await dismissed;
      expect(message).toMatch(/discard/i);
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      fs.writeFileSync(
        `${SHOT_DIR}/${viewport.name}-06-type-switch-confirm.txt`,
        `browser confirm() shown on type switch with entered content:\n${message}\n`,
      );
      await expect(kind).toHaveValue("flyer");
      await expect(headlineInput(dialog)).toHaveValue(
        "Sunlit 2BR — first month free",
      );

      // Accepting it switches and discards.
      page.once("dialog", (d) => void d.accept());
      await kind.selectOption("text");
      await expect(kind).toHaveValue("text");
      await expect(dialog.locator("#promotion-text-format")).toBeVisible();

      // Switching back shows a cleared flyer form (content was discarded).
      await kind.selectOption("flyer");
      await expect(headlineInput(dialog)).toHaveValue("");

      // Close (X) still works.
      await dialog.getByRole("button", { name: /close/i }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("creates a text promotion straight from the type dropdown", async ({ page }) => {
      const frame = await openPromotionSection(page);
      const textPill = page.locator('[data-attr="promotion-filter-text"]');
      await expect(textPill).toContainText("2");

      await page.locator('[data-attr="promotion-new"]').click();
      const dialog = page.getByRole("dialog");
      await dialog.locator('[data-attr="promotion-new-kind"]').selectOption("text");

      // Attach it to a real property, then submit from inside the same modal.
      const property = dialog.locator("#promotion-text-property");
      await property.selectOption({ index: 1 });
      await dialog.locator('[data-attr="promotion-text-generate-submit"]').click();

      // Modal closes on success and the new text asset lands in the list, with
      // the Text pill count bumped.
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(textPill).toContainText("3");
      // The asset stack renders a desktop row and a mobile card; either is fine.
      await expect(page.getByText("Text 3", { exact: true }).first()).toBeVisible();
      await frame.screenshot({
        path: `${SHOT_DIR}/${viewport.name}-07-text-promotion-created.png`,
      });
    });
  });
}
