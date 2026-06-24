#!/usr/bin/env node
/**
 * Forward Stripe webhooks to the local Next.js app.
 * Requires Stripe CLI: https://stripe.com/docs/stripe-cli#install
 *
 * Usage:
 *   npm run stripe:listen
 *
 * Copy the printed `whsec_…` signing secret into STRIPE_WEBHOOK_SECRET in `.env.local`,
 * then restart `npm run dev`.
 */

import { spawnSync } from "node:child_process";

const forwardTo = process.env.STRIPE_LISTEN_FORWARD ?? "localhost:3000/api/stripe/webhook";

const which = spawnSync("stripe", ["--version"], { encoding: "utf8" });
if (which.error || which.status !== 0) {
  console.error("Stripe CLI is not installed.\n");
  console.error("Install:");
  console.error("  macOS:  brew install stripe/stripe-cli/stripe");
  console.error("  Other:  https://stripe.com/docs/stripe-cli#install\n");
  console.error("Then:");
  console.error("  stripe login");
  console.error(`  stripe listen --forward-to ${forwardTo}`);
  console.error("\nPaste the webhook signing secret (whsec_…) into STRIPE_WEBHOOK_SECRET in .env.local");
  process.exit(1);
}

console.log(`Forwarding Stripe events → http://${forwardTo}\n`);
const child = spawnSync("stripe", ["listen", "--forward-to", forwardTo], { stdio: "inherit" });
process.exit(child.status ?? 1);
