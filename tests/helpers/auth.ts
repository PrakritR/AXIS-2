import type { Page } from "@playwright/test";
import { E2E_ACCOUNTS } from "../fixtures";

export async function signIn(page: Page, email: string, password: string, next = "/portal/dashboard") {
  const nextPath = next.split("?")[0] ?? next;
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(
    (url) => url.pathname === nextPath || url.pathname.startsWith(`${nextPath}/`),
    { timeout: 30_000 },
  );
}

export async function signInAsAdmin(page: Page) {
  await signIn(page, E2E_ACCOUNTS.admin.email, E2E_ACCOUNTS.admin.password, "/admin/dashboard");
}

export async function signInAsManager(page: Page) {
  await signIn(page, E2E_ACCOUNTS.manager.email, E2E_ACCOUNTS.manager.password, "/portal/dashboard");
}

export async function signInAsResident(page: Page) {
  await signIn(page, E2E_ACCOUNTS.resident.email, E2E_ACCOUNTS.resident.password, "/resident/dashboard");
}

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
