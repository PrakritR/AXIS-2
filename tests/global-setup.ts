import { chromium } from "@playwright/test";

// Preflight for the portal E2E suite.
//
// When E2E_TESTS_ENABLED=1 the portal specs sign in as seeded accounts
// (admin/manager/resident) before asserting anything. If those accounts are not
// reachable — the E2E_* credential secrets are missing/blank, or the accounts
// were never seeded into the target Supabase project — every one of those specs
// stalls on `page.waitForURL(... 30s)` and, with 131 specs run serially at
// `retries: 2`, the whole job grinds for hours before GitHub's 6h default kills
// it. That is exactly how CI on `main` hung: the E2E_* repo secrets do not exist,
// so sign-in submitted empty credentials and never navigated.
//
// This preflight does ONE real admin sign-in as a smoke check. If it cannot
// complete within a short budget it throws immediately, so a misconfigured suite
// fails in seconds with an actionable message instead of hanging. It is a no-op
// unless E2E_TESTS_ENABLED=1, so it never affects local runs that intentionally
// skip the portal specs.
const SMOKE_TIMEOUT_MS = 25_000;

function adminCredentials() {
  return {
    email: process.env.E2E_ADMIN_EMAIL?.trim() || "admin@test.axis.local",
    password: process.env.E2E_ADMIN_PASSWORD?.trim() || "TestAdmin123!",
  };
}

async function globalSetup() {
  if (process.env.E2E_TESTS_ENABLED !== "1") return;

  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { email, password } = adminCredentials();
  const next = "/admin/dashboard";

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto(`${baseURL}/auth/sign-in?next=${encodeURIComponent(next)}`, {
      waitUntil: "domcontentloaded",
      timeout: SMOKE_TIMEOUT_MS,
    });
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(
      (url) => url.pathname === next || url.pathname.startsWith(`${next}/`),
      { timeout: SMOKE_TIMEOUT_MS },
    );
  } catch (error) {
    const usedDefaultAccount = !process.env.E2E_ADMIN_EMAIL?.trim();
    const lines = [
      "E2E preflight failed: could not sign in as the admin E2E account.",
      `Tried "${email}" against ${baseURL}.`,
    ];
    if (usedDefaultAccount) {
      lines.push("(E2E_ADMIN_EMAIL is unset/blank, so the built-in default account name was used.)");
    }
    lines.push(
      "",
      "E2E_TESTS_ENABLED=1 makes the portal suite sign in as seeded accounts, but the",
      "sign-in never completed. The accounts are almost certainly not seeded in the target",
      "Supabase project, or the E2E_* credential secrets are missing/wrong. Without them",
      "every portal spec times out on waitForURL and the job hangs for hours.",
      "",
      "Fix one of:",
      "  • Seed the accounts (`npm run test:seed`) and set the E2E_* repo secrets to match, or",
      "  • Unset E2E_TESTS_ENABLED so the portal specs skip instead of timing out.",
      "See tests/README.md.",
      "",
      `Underlying error: ${(error as Error).message.split("\n")[0]}`,
    );
    throw new Error(lines.join("\n"));
  } finally {
    await browser.close();
  }
}

export default globalSetup;
