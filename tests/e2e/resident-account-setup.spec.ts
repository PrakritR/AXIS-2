import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mockFreeApplicationFee } from "../helpers/e2e-supabase";
import { visibleLocator, walkGuestRentalApplication } from "../helpers/rental-wizard-e2e";

/**
 * Resident account creation after a guest rental application — the full repair
 * this suite guards:
 *
 *   guest applies to a listing  →  application row + setup token persisted
 *   →  finish screen offers "Create your resident account" (setup handoff)
 *   →  /auth/resident-setup prefilled (email + phone), set a password
 *   →  provisioned, signed in, lands on /resident/applications with the app visible.
 *
 * No `403 Could not create resident account` anywhere on the happy path.
 *
 * Gated off by default (needs a dev/test Supabase project + a fee-free listing
 * fixture, exactly like group-application-lifecycle.spec.ts). Enable with
 * RESIDENT_SETUP_E2E_ENABLED=1 once the fixture below exists. Never point at
 * production.
 *
 * Fixture (dev/test only):
 *   - a `live` `manager_property_records` row (RESIDENT_SETUP_E2E_PROPERTY_ID,
 *     default `mgr-test-willow-group`) whose listing charges no application fee.
 */

const PROPERTY_ID = process.env.RESIDENT_SETUP_E2E_PROPERTY_ID ?? "mgr-test-willow-group";
// A fresh guest each run so account creation is exercised, not a re-link.
const GUEST_EMAIL = process.env.RESIDENT_SETUP_E2E_EMAIL ?? "resident.setup.e2e@test.proplane.local";
const GUEST = { email: GUEST_EMAIL, name: "Riley Setup", phone: "2065550142", password: "ResidentSetup123!" };

const DESKTOP = { width: 1440, height: 1000 };

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-role-key-unset",
  { auth: { persistSession: false } },
);

function txt(page: Page, needle: string | RegExp) {
  return page.getByText(needle).filter({ visible: true }).first();
}

test.describe.configure({ mode: "serial", timeout: 600_000 });

test.describe("Resident account setup after applying", () => {
  test.skip(
    process.env.RESIDENT_SETUP_E2E_ENABLED !== "1",
    "SKIPPED — RESIDENT_SETUP_E2E_ENABLED is not 1, so the live guest-apply → setup-handoff → " +
      "account-creation round trip did NOT run. Set it with a dev/test Supabase .env and the " +
      "fee-free listing fixture. Deterministic coverage of the handoff/token/phone/relink pieces " +
      "lives in the unit suite (send-application-submitted-handoff, resident-setup-route, " +
      "register-resident-oauth-relink, resident-setup-token-relink).",
  );

  test.beforeAll(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("RESIDENT_SETUP_E2E_ENABLED=1 but Supabase env is unset. Seed a DEV/TEST .env — never production.");
    }
  });

  // Idempotent: clear any prior run's application + auth user for the guest email.
  test.beforeAll(async () => {
    await db.from("manager_application_records").delete().eq("resident_email", GUEST.email);
    const { data } = await db.auth.admin.listUsers();
    const existing = data?.users?.find((u) => (u.email ?? "").toLowerCase() === GUEST.email.toLowerCase());
    if (existing) await db.auth.admin.deleteUser(existing.id);
  });

  test("guest applies, then creates a resident account from the finish-screen handoff", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await mockFreeApplicationFee(page);
    await walkGuestRentalApplication(page, PROPERTY_ID, GUEST);

    // The finish screen offers the account-creation CTA (server-authoritative handoff).
    const createCta = page.getByRole("link", { name: /Create your resident account/i }).filter({ visible: true }).first();
    await expect(createCta).toBeVisible({ timeout: 30_000 });
    await createCta.click();

    // Resident setup, prefilled from the application (email locked; phone carried over).
    await expect(page).toHaveURL(/\/auth\/resident-setup\?token=/, { timeout: 30_000 });
    await expect(visibleLocator(page, "#resident-setup-email")).toHaveValue(GUEST.email, { timeout: 30_000 });
    await expect(visibleLocator(page, "#resident-setup-phone")).not.toHaveValue("");
    await visibleLocator(page, "#resident-setup-password").fill(GUEST.password);
    await visibleLocator(page, "#resident-setup-confirm").fill(GUEST.password);
    await page.getByRole("button", { name: /Create resident account/i }).click();

    // Signed in, landed in the resident portal — never a 403 dead end.
    await page.waitForURL((url) => url.pathname.startsWith("/resident"), { timeout: 60_000 });
    await expect(txt(page, /Could not create resident account/i)).toHaveCount(0);

    // The submitted application is visible in the resident portal.
    for (let i = 0; i < 6; i += 1) {
      await page.goto("/resident/applications");
      await page.waitForTimeout(1500);
      if (!page.url().includes("/apply")) break;
    }
    await expect(txt(page, GUEST.name)).toBeVisible({ timeout: 30_000 });
  });
});
