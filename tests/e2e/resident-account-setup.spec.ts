import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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
const GUEST_EMAIL = process.env.RESIDENT_SETUP_E2E_EMAIL ?? "resident.setup.e2e@test.axis.local";
const GUEST = { email: GUEST_EMAIL, name: "Riley Setup", phone: "2065550142", password: "ResidentSetup123!" };

const DESKTOP = { width: 1440, height: 1000 };

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-role-key-unset",
  { auth: { persistSession: false } },
);

function vis(page: Page, selector: string): Locator {
  return page.locator(selector).filter({ visible: true }).first();
}
function txt(page: Page, needle: string | RegExp): Locator {
  return page.getByText(needle).filter({ visible: true }).first();
}
function continueBtn(page: Page) {
  return vis(page, '[data-attr="rental-wizard-continue"]');
}
async function yesNo(page: Page, fieldKey: string, answer: "Yes" | "No") {
  await page
    .locator(`[data-wizard-field="${fieldKey}"] button`, { hasText: new RegExp(`^${answer}$`) })
    .filter({ visible: true })
    .first()
    .click();
}
function isoInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Walk the 12-step wizard as a guest (no group) and submit. */
async function submitGuestApplication(page: Page) {
  await page.goto(`/rent/apply?propertyId=${PROPERTY_ID}`);
  await expect(continueBtn(page)).toBeVisible({ timeout: 30_000 });

  // Step 1: not a group.
  await yesNo(page, "applyingAsGroup", "No");
  await continueBtn(page).click();
  // Step 2: co-signer.
  await expect(vis(page, '[data-wizard-field="hasCosigner"]')).toBeVisible();
  await yesNo(page, "hasCosigner", "No");
  await continueBtn(page).click();
  // Step 3: property + lease dates.
  await expect(vis(page, "#leaseTerm")).toBeVisible();
  const leaseTerm = vis(page, "#leaseTerm");
  const values = await leaseTerm
    .locator("option")
    .evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value).filter(Boolean));
  await leaseTerm.selectOption(values[0]!);
  await vis(page, "#leaseStart").fill(isoInDays(30));
  await vis(page, "#leaseStart").blur();
  const leaseEnd = vis(page, "#leaseEnd");
  if ((await leaseEnd.count()) && !(await leaseEnd.inputValue())) await leaseEnd.fill(isoInDays(395));
  await continueBtn(page).click();
  // Step 4: applicant.
  await expect(vis(page, "#fullLegalName")).toBeVisible();
  await vis(page, "#fullLegalName").fill(GUEST.name);
  await vis(page, "#dateOfBirth").fill("1994-04-12");
  await vis(page, "#ssn").fill("123456789");
  await vis(page, "#driversLicense").fill("WDL9931002");
  await vis(page, "#phone").fill(GUEST.phone);
  const email = vis(page, "#email");
  if (await email.isEditable()) await email.fill(GUEST.email);
  await continueBtn(page).click();
  // Step 5: current address.
  await expect(vis(page, "#currentStreet")).toBeVisible();
  await vis(page, "#currentStreet").fill("88 Dexter Ave N, Apt 4");
  await vis(page, "#currentCity").fill("Seattle");
  await vis(page, "#currentState").fill("WA");
  await vis(page, "#currentZip").fill("98109");
  await continueBtn(page).click();
  // Step 6: previous address.
  await txt(page, "I do not have a previous address to provide").click();
  await continueBtn(page).click();
  // Step 7: employment + income.
  await expect(vis(page, "#employer")).toBeVisible();
  await vis(page, "#employer").fill("Northwest Design Co.");
  await vis(page, "#monthlyIncome").fill("6400");
  await continueBtn(page).click();
  // Step 8: references.
  await expect(vis(page, "#ref1Name")).toBeVisible();
  await vis(page, "#ref1Name").fill("Dana Whitfield");
  await vis(page, "#ref1Relationship").fill("Former landlord");
  await vis(page, "#ref1Phone").fill("2065550188");
  await continueBtn(page).click();
  // Step 9: additional details.
  await expect(vis(page, "#occupancyCount")).toBeVisible();
  await vis(page, "#occupancyCount").selectOption("1");
  await yesNo(page, "evictionHistory", "No");
  await yesNo(page, "bankruptcyHistory", "No");
  await yesNo(page, "criminalHistory", "No");
  await continueBtn(page).click();
  // Step 10: consent + signature.
  await expect(vis(page, "#digitalSignature")).toBeVisible();
  await vis(page, '[data-wizard-field="consentCredit"] input[type="checkbox"]').check();
  await vis(page, '[data-wizard-field="consentTruth"] input[type="checkbox"]').check();
  await vis(page, "#digitalSignature").fill(GUEST.name);
  await vis(page, "#dateSigned").fill(isoInDays(0));
  await continueBtn(page).click();
  // Step 11: review.
  await expect(continueBtn(page)).toBeVisible({ timeout: 15_000 });
  await continueBtn(page).click();
  // Step 12: submit (fee-free listing).
  await expect(continueBtn(page)).toHaveText(/submit application/i, { timeout: 15_000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const label = await continueBtn(page).innerText().catch(() => "");
    if (/submit application/i.test(label)) await continueBtn(page).click();
    if (await txt(page, /Application ID:/i).isVisible().catch(() => false)) break;
    await page.waitForTimeout(1500);
  }
  await expect(txt(page, /Application ID:/i)).toBeVisible({ timeout: 60_000 });
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
    await submitGuestApplication(page);

    // The finish screen offers the account-creation CTA (server-authoritative handoff).
    const createCta = page.getByRole("link", { name: /Create your resident account/i }).filter({ visible: true }).first();
    await expect(createCta).toBeVisible({ timeout: 30_000 });
    await createCta.click();

    // Resident setup, prefilled from the application (email locked; phone carried over).
    await expect(page).toHaveURL(/\/auth\/resident-setup\?token=/, { timeout: 30_000 });
    await expect(vis(page, "#resident-setup-email")).toHaveValue(GUEST.email, { timeout: 30_000 });
    await expect(vis(page, "#resident-setup-phone")).not.toHaveValue("");
    await vis(page, "#resident-setup-password").fill(GUEST.password);
    await vis(page, "#resident-setup-confirm").fill(GUEST.password);
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
