#!/usr/bin/env node
/**
 * Configure Supabase Apple web OAuth (dev/test or any project via Management API).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/configure-apple-web-oauth.mjs \
 *     --p8 ~/Downloads/AuthKey_9872GVCALV.p8 \
 *     --project-ref emstjswhotsnyksqhqyf
 *
 * Get a token: https://supabase.com/dashboard/account/tokens
 *
 * Does NOT commit secrets. JWT is sent to Supabase only.
 */
import { createPrivateKey, sign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const TEAM_ID = "8FH3GVHCZ9";
const KEY_ID = "9872GVCALV";
const BUNDLE_ID = "com.axisseattlehousing.app";
const SERVICES_ID = "com.axisseattlehousing.app.web";

function parseArgs(argv) {
  const opts = {
    p8: resolve(homedir(), "Downloads/AuthKey_9872GVCALV.p8"),
    projectRef: "emstjswhotsnyksqhqyf",
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--p8") opts.p8 = resolve(argv[++i] ?? "");
    else if (arg === "--project-ref") opts.projectRef = argv[++i] ?? opts.projectRef;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: SUPABASE_ACCESS_TOKEN=... node scripts/configure-apple-web-oauth.mjs [options]

Options:
  --p8 <path>           Apple .p8 signing key (default: ~/Downloads/AuthKey_9872GVCALV.p8)
  --project-ref <ref>   Supabase project ref (default: emstjswhotsnyksqhqyf)
  --dry-run             Generate JWT only; do not PATCH Supabase
`);
      process.exit(0);
    }
  }
  return opts;
}

function generateAppleClientSecret(p8Path) {
  const p8 = readFileSync(p8Path, "utf8");
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86400 * 180; // Apple max ~6 months

  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: KEY_ID })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: TEAM_ID,
      iat: now,
      exp,
      aud: "https://appleid.apple.com",
      sub: SERVICES_ID,
    }),
  ).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(p8);
  const sig = sign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
  return { secret: `${signingInput}.${sig.toString("base64url")}`, exp };
}

const WEB_REDIRECT_URLS = [
  "http://localhost:3000/auth/callback",
  "http://localhost:3000/auth/callback/partner-pricing",
  "http://localhost:3000/auth/callback/resident-signup",
  "http://localhost:3000/auth/callback/vendor-signup",
  `${BUNDLE_ID}://auth/callback`,
  `${BUNDLE_ID}://auth/callback/partner-pricing`,
  `${BUNDLE_ID}://auth/callback/resident-signup`,
  `${BUNDLE_ID}://auth/callback/vendor-signup`,
  `${BUNDLE_ID}://auth/callback/**`,
];

async function fetchAuthConfig(projectRef, token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET config/auth failed (${res.status}): ${body}`);
  }
  return res.json();
}

function mergeAllowList(existing, required) {
  const current = (existing ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const merged = [...new Set([...current, ...required])];
  return merged.join(",");
}

async function patchAuthConfig(projectRef, token, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH config/auth failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function main() {
  const opts = parseArgs(process.argv);
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

  if (!existsSync(opts.p8)) {
    console.error(`Apple .p8 key not found: ${opts.p8}`);
    console.error(`Download AuthKey_${KEY_ID}.p8 from Apple Developer → Keys, then re-run with --p8 <path>.`);
    console.error("Diagnose without .p8: node --env-file=.env.local scripts/diagnose-apple-web-oauth.mjs");
    process.exit(1);
  }

  const { secret, exp } = generateAppleClientSecret(opts.p8);

  console.log("Apple web OAuth values:");
  console.log(`  Team ID:      ${TEAM_ID}`);
  console.log(`  Key ID:       ${KEY_ID}`);
  console.log(`  Services ID:  ${SERVICES_ID}`);
  console.log(`  Bundle ID:    ${BUNDLE_ID}`);
  console.log(`  Secret exp:   ${new Date(exp * 1000).toISOString()}`);
  console.log(`  Project ref:  ${opts.projectRef}`);
  console.log("\nPrerequisite — Apple Developer (Identifiers → Services IDs):");
  console.log(`  1. Create Services ID: ${SERVICES_ID}`);
  console.log("  2. Enable Sign in with Apple → Configure");
  console.log(`  3. Domain: ${opts.projectRef}.supabase.co`);
  console.log(`  4. Return URL: https://${opts.projectRef}.supabase.co/auth/v1/callback`);
  console.log(
    "\nIf this Services ID does not exist, Apple shows invalid_client on localhost even when Supabase is configured.",
  );

  if (opts.dryRun && !token) {
    console.log("\nDry run — JWT generated; set SUPABASE_ACCESS_TOKEN to apply.");
    process.exit(0);
  }

  if (!token) {
    console.log("\nSUPABASE_ACCESS_TOKEN not set — dashboard values to paste:");
    console.log(`  Client IDs:  ${BUNDLE_ID},${SERVICES_ID}`);
    console.log(`  Secret Key:  <generated JWT, ${secret.length} chars — run locally, do not commit>`);
    console.log("  Redirect URLs (merge into allowlist):");
    for (const url of WEB_REDIRECT_URLS) console.log(`    ${url}`);
    console.log("\nRe-run with SUPABASE_ACCESS_TOKEN to apply via Management API.");
    process.exit(1);
  }

  const current = await fetchAuthConfig(opts.projectRef, token);
  const patch = {
    external_apple_enabled: true,
    external_apple_client_id: SERVICES_ID,
    external_apple_additional_client_ids: BUNDLE_ID,
    external_apple_secret: secret,
    uri_allow_list: mergeAllowList(current.uri_allow_list, WEB_REDIRECT_URLS),
  };

  if (opts.dryRun) {
    console.log("\nDry run — would PATCH:", JSON.stringify({ ...patch, external_apple_secret: "<redacted>" }, null, 2));
    return;
  }

  await patchAuthConfig(opts.projectRef, token, patch);
  console.log("\nSupabase Apple web OAuth configured successfully.");
  console.log("Probe: open /auth/sign-in on localhost and click Continue with Apple.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
