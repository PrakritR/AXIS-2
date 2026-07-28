import { type Page, expect } from "@playwright/test";
import { E2E_ACCOUNTS } from "../fixtures";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type PortalRole = "admin" | "manager" | "resident" | "vendor";

/**
 * Label the portal chooser (`/auth/choose-portal`) renders for each role — see
 * ROLE_META in src/app/auth/choose-portal/page.tsx. The chooser option is a
 * <button> whose accessible name starts with this label, so an anchored regex
 * targets exactly one role.
 */
const PORTAL_CHOOSER_LABEL: Record<PortalRole, string> = {
  admin: "Admin",
  manager: "Property",
  resident: "Resident",
  vendor: "Vendor",
};

/**
 * Sign in through the unified auth hub. Returns once authentication has settled
 * (the URL has left `/auth/sign-in`) — the exact post-auth landing is NOT
 * asserted here because it varies: a single-role account lands on its portal,
 * while a multi-role account may pass through `/auth/continue` or the portal
 * chooser. Callers that need to be IN a specific portal must follow with
 * `establishActivePortal` (or use the `signInAs*` helpers, which do).
 */
export async function signIn(page: Page, email: string, password: string, next = "/portal/dashboard") {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  // The unified auth hub renders label-less inputs (placeholder only).
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => url.pathname !== "/auth/sign-in", { timeout: 30_000 });
}

/**
 * Pin the active portal for a (possibly multi-role) signed-in account.
 *
 * Multi-role accounts are a shipped feature (one login can hold manager +
 * resident + …). For them, `effectiveRole` is derived ONLY from the
 * `axis_active_portal` cookie (src/lib/auth/portal-access.ts), and sign-in does
 * NOT set that cookie — so every direct navigation to `/portal/*` bounces to the
 * chooser (`portal-layout-guard.ts`). The only thing that sets the cookie is the
 * chooser itself (POST /api/auth/set-active-portal). We therefore drive the
 * chooser explicitly and pick the role, which pins the cookie so subsequent
 * direct navigations stay put. A single-role account renders exactly one chooser
 * option (its own), so this is a harmless no-op-shaped step for them too.
 */
export async function establishActivePortal(page: Page, role: PortalRole, next: string) {
  const nextPath = next.split("?")[0] ?? next;
  await page.goto(`/auth/choose-portal?next=${encodeURIComponent(next)}`);
  const option = page.getByRole("button", { name: new RegExp(`^${PORTAL_CHOOSER_LABEL[role]}\\b`) });
  // The chooser fetches the account's roles asynchronously, so the option is NOT
  // present on the first tick — auto-wait for it (click retries until it's
  // actionable) rather than checking count() immediately, which races the fetch
  // and skips the click. If we were already redirected into the portal, the
  // option never appears; swallow that and let the URL poll below confirm.
  await option
    .first()
    .click({ timeout: 15_000 })
    .catch(() => {});
  // The chooser navigates via a client-side router.push (no full page load).
  // Poll page.url() directly rather than page.waitForURL — the latter also waits
  // on a navigation lifecycle event that a pushState nav may never fire, which
  // can hang it even after the URL has already changed.
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
    .toMatch(new RegExp(`^${escapeRegExp(nextPath)}(/|$)`));
}

export async function signInAsAdmin(page: Page) {
  await signIn(page, E2E_ACCOUNTS.admin.email, E2E_ACCOUNTS.admin.password, "/admin/dashboard");
  await establishActivePortal(page, "admin", "/admin/dashboard");
}

export async function signInAsManager(page: Page) {
  await signIn(page, E2E_ACCOUNTS.manager.email, E2E_ACCOUNTS.manager.password, "/portal/dashboard");
  await establishActivePortal(page, "manager", "/portal/dashboard");
}

export async function signInAsResident(page: Page) {
  await signIn(page, E2E_ACCOUNTS.resident.email, E2E_ACCOUNTS.resident.password, "/resident/dashboard");
  await establishActivePortal(page, "resident", "/resident/dashboard");
}

// Note: establishActivePortal is uniform across roles on purpose. `admin`
// resolves admin access from profile_roles (not the active-portal cookie), and
// `admin`/`resident` are single-role today so the chooser shows one option — but
// routing every helper through the same portal-pinning step is what keeps the
// suite correct if any of these accounts later becomes multi-role (a shipped
// feature), instead of silently regressing the way the manager account did.

export function mockStripeCheckoutRoutes(page: Page) {
  return page.route("**/api/stripe/**", async (route) => {
    const url = route.request().url();
    if (url.includes("application-fee-checkout") || url.includes("household-charge-checkout")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          clientSecret: "cs_test_mock_secret",
          sessionId: "cs_test_mock_session",
          platformFeeCents: 0,
        }),
      });
      return;
    }
    if (url.includes("application-fee-verify") || url.includes("household-charge-verify")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ paid: true, processing: false }),
      });
      return;
    }
    await route.continue();
  });
}

export function mockStripeAllRoutes(page: Page) {
  return page.route("**/api/stripe/**", async (route) => {
    const url = route.request().url();
    if (url.includes("application-fee-checkout") || url.includes("household-charge-checkout")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ clientSecret: "cs_test_mock_secret", sessionId: "cs_test_mock_session", platformFeeCents: 0 }),
      });
      return;
    }
    if (url.includes("application-fee-verify") || url.includes("household-charge-verify")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ paid: true, processing: false }),
      });
      return;
    }
    if (url.includes("/api/stripe/checkout")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ clientSecret: "cs_test_mock", sessionId: "cs_test_mock_session" }),
      });
      return;
    }
    if (url.includes("checkout-portal") || url.includes("billing-portal")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://checkout.stripe.test/mock" }),
      });
      return;
    }
    if (url.includes("confirm-checkout-session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    await route.continue();
  });
}
