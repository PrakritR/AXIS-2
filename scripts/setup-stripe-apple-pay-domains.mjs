#!/usr/bin/env node
/**
 * Register production domains with Stripe for Apple Pay on Checkout (subscriptions).
 *
 * Usage:
 *   node --env-file=.env.local scripts/setup-stripe-apple-pay-domains.mjs
 *   node --env-file=.env.local scripts/setup-stripe-apple-pay-domains.mjs --validate-only
 *
 * Requires STRIPE_SECRET_KEY and NEXT_PUBLIC_APP_URL (and optionally
 * NEXT_PUBLIC_CANONICAL_APP_URL). See docs/stripe-apple-pay-subscriptions.md.
 */

import Stripe from "stripe";

const VALIDATE_ONLY = process.argv.includes("--validate-only");

function subscriptionCheckoutApplePayDomains() {
  const raw = [
    process.env.NEXT_PUBLIC_CANONICAL_APP_URL?.trim(),
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
  ].filter(Boolean);

  const hostnames = new Set();
  for (const value of raw) {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
        hostnames.add(hostname);
      }
    } catch {
      /* ignore */
    }
  }
  return [...hostnames];
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

const secret = process.env.STRIPE_SECRET_KEY?.trim();
if (!secret?.startsWith("sk_")) fail("STRIPE_SECRET_KEY missing or invalid");

const domains = subscriptionCheckoutApplePayDomains();
if (domains.length === 0) {
  fail(
    "No domains to register. Set NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_CANONICAL_APP_URL to your production hostname.",
  );
}

const stripe = new Stripe(secret);

console.log(`Stripe mode: ${secret.includes("_test_") ? "test" : "live"}`);
console.log(`Domains: ${domains.join(", ")}\n`);

const existing = await stripe.paymentMethodDomains.list({ limit: 100 });
const byName = new Map(existing.data.map((row) => [row.domain_name, row]));

for (const domain of domains) {
  let row = byName.get(domain);
  if (!row && !VALIDATE_ONLY) {
    row = await stripe.paymentMethodDomains.create({ domain_name: domain });
    ok(`Registered ${domain}`);
  } else if (!row) {
    console.log(`• ${domain} — not registered (run without --validate-only to create)`);
    continue;
  } else {
    ok(`Already registered ${domain}`);
  }

  if (VALIDATE_ONLY || row) {
    const validated = await stripe.paymentMethodDomains.validate(row.id);
    const applePay = validated.apple_pay?.status ?? "unknown";
    if (applePay === "active") ok(`  Apple Pay: active on ${domain}`);
    else if (applePay === "pending") console.log(`  Apple Pay: pending verification on ${domain}`);
    else console.log(`  Apple Pay: ${applePay} on ${domain}`);
  }
}

console.log("\nNext steps:");
console.log("  1. Stripe Dashboard → Settings → Payment methods → enable Apple Pay");
console.log("  2. Complete any domain verification Stripe shows for each hostname");
console.log("  3. Test checkout on Safari (macOS/iOS) or the Axis iOS app WebView");
