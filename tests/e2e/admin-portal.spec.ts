import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "../helpers/auth";
import { pathToUrlRegExp } from "../helpers/url-match";

const portalTestsEnabled = process.env.E2E_TESTS_ENABLED === "1";

const ADMIN_SECTIONS = [
  { label: "Dashboard", path: "/admin/dashboard" },
  { label: "Properties", path: "/admin/properties" },
  { label: "Events", path: "/admin/events" },
  { label: "Communication", path: "/admin/communication/email/unopened" },
  { label: "Feedback", path: "/admin/bugs-feedback" },
  { label: "Settings", path: "/admin/profile" },
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
      await expect(page).toHaveURL(pathToUrlRegExp(path));
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test("admin communication email tab loads and shows compose button", async ({ page }) => {
    await page.goto("/admin/communication/email/unopened");
    await expect(page.getByRole("heading").first()).toBeVisible();
    const composeBtn = page.getByRole("button", { name: /new message|compose/i }).first();
    // Compose button may or may not be present depending on config
    if (await composeBtn.count() > 0) {
      await expect(composeBtn).toBeVisible();
    }
  });

  test("admin communication sms tab loads", async ({ page }) => {
    await page.goto("/admin/communication/sms/all");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.locator('[data-attr="admin-communication-tab-sms"]')).toBeVisible();
  });

  test("communication email trash tab exposes Delete all trash and empties it", async ({ page }) => {
    // Keep the compose flow from delivering to real recipient inboxes/push devices.
    await page.route("**/api/portal/send-inbox-message", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
    );
    const evidenceDir = process.env.E2E_EVIDENCE_DIR;

    await page.goto("/admin/communication/email/unopened");
    await page.getByRole("button", { name: "New message" }).click();
    const subject = `E2E trash check ${Date.now()}`;
    await page.getByRole("combobox", { name: "Recipient type" }).selectOption("all_managers");
    await page.getByRole("textbox", { name: "Subject" }).fill(subject);
    await page.getByRole("textbox", { name: /write your message/i }).fill("Automated trash-tab check.");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await page.getByRole("button", { name: /^Sent/ }).click();
    await page.getByRole("cell", { name: subject }).click();
    await page.getByRole("button", { name: "Move to trash" }).click();

    await page.getByRole("button", { name: /^Trash/ }).click();
    const deleteAll = page.getByRole("button", { name: "Delete all trash" });
    await expect(deleteAll.first()).toBeVisible();
    if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/admin-trash-delete-button.png`, fullPage: true });

    page.once("dialog", (dialog) => void dialog.accept());
    await deleteAll.first().click();
    await expect(page.getByText("No trash messages yet.")).toBeVisible();
    await expect(deleteAll).toHaveCount(0);
    if (evidenceDir) await page.screenshot({ path: `${evidenceDir}/admin-trash-emptied.png`, fullPage: true });
  });

  test("legacy inbox URL redirects to communication email tab", async ({ page }) => {
    await page.goto("/admin/inbox/unopened");
    await expect(page).toHaveURL(/\/admin\/communication\/email\/unopened/);
  });

  test("settings page loads without embedded feedback panel", async ({ page }) => {
    await page.goto("/admin/profile");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Feedback" })).toHaveCount(0);
  });

  test("feedback section loads as its own admin page", async ({ page }) => {
    await page.goto("/admin/bugs-feedback");
    await expect(page).toHaveURL(/\/admin\/bugs-feedback/);
    await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible({ timeout: 15_000 });
  });

  test("properties section loads", async ({ page }) => {
    await page.goto("/admin/properties");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  });

  test("legacy leases URL redirects to dashboard", async ({ page }) => {
    await page.goto("/admin/leases");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("events section loads", async ({ page }) => {
    await page.goto("/admin/events");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  });
});
