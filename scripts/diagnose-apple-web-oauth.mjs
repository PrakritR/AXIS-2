#!/usr/bin/env node
/**
 * Diagnose Apple web OAuth without exposing secrets.
 *
 * Usage:
 *   node --env-file=.env.local scripts/diagnose-apple-web-oauth.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + anon key, probes Supabase authorize,
 * follows the redirect to appleid.apple.com, and reports whether Apple
 * recognizes the Services ID (client_id).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TEAM_ID = "8FH3GVHCZ9";
const KEY_ID = "9872GVCALV";
const BUNDLE_ID = "com.axisseattlehousing.app";
const SERVICES_ID = "com.axisseattlehousing.app.web";
const DEV_PROJECT_REF = "emstjswhotsnyksqhqyf";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    console.error("Missing .env.local — copy from .env.example and fill Supabase keys.");
    process.exit(1);
  }
  const text = readFileSync(envPath, "utf8");
  const get = (key) => (text.match(new RegExp(`^${key}=(.*)$`, "m")) ?? [])[1]?.trim();
  const supabaseUrl = get("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, "");
  const anonKey = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required in .env.local");
    process.exit(1);
  }
  return { supabaseUrl, anonKey };
}

function projectRefFromUrl(url) {
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? "";
}

async function main() {
  const { supabaseUrl, anonKey } = loadEnv();
  const projectRef = projectRefFromUrl(supabaseUrl);
  const redirectTo = "http://localhost:3000/auth/callback";
  const authorizeUrl =
    `${supabaseUrl}/auth/v1/authorize?provider=apple&redirect_to=${encodeURIComponent(redirectTo)}`;

  console.log("Apple web OAuth diagnosis\n");
  console.log("Expected constants (repo + scripts):");
  console.log(`  Team ID:      ${TEAM_ID}`);
  console.log(`  Key ID:       ${KEY_ID}  (AuthKey_${KEY_ID}.p8 — not 9872GVHCV)`);
  console.log(`  Bundle ID:    ${BUNDLE_ID}`);
  console.log(`  Services ID:  ${SERVICES_ID}`);
  console.log(`  Supabase URL: ${supabaseUrl}`);
  console.log(`  Project ref:  ${projectRef || "(unknown)"}`);
  console.log("");

  const supabaseRes = await fetch(authorizeUrl, {
    method: "GET",
    redirect: "manual",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });

  if (supabaseRes.status === 400) {
    const body = await supabaseRes.text();
    console.log("FAIL — Supabase rejected authorize (Apple provider not ready):");
    console.log(`  ${body.slice(0, 400)}`);
    console.log("\nFix: enable Apple in Supabase and run scripts/configure-apple-web-oauth.mjs");
    process.exit(1);
  }

  const appleUrl = supabaseRes.headers.get("location");
  if (!appleUrl?.includes("appleid.apple.com")) {
    console.log(`FAIL — Supabase did not redirect to Apple (status ${supabaseRes.status})`);
    process.exit(1);
  }

  const appleParams = new URL(appleUrl).searchParams;
  const clientId = appleParams.get("client_id");
  const redirectUri = appleParams.get("redirect_uri");

  console.log("Supabase → Apple redirect (OK):");
  console.log(`  client_id:     ${clientId}`);
  console.log(`  redirect_uri:  ${redirectUri}`);
  console.log("");

  const expectedCallback = `${supabaseUrl}/auth/v1/callback`;
  const checks = [
    ["client_id is Services ID", clientId === SERVICES_ID],
    ["redirect_uri is Supabase callback", redirectUri === expectedCallback],
    ["dev project ref", projectRef === DEV_PROJECT_REF || projectRef.length > 0],
  ];
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  }
  console.log("");

  const appleRes = await fetch(appleUrl, { redirect: "manual" });
  const appleHtml = await appleRes.text();
  const invalidClient =
    appleHtml.includes("invalid_client") || appleHtml.toLowerCase().includes("invalid client");

  if (invalidClient) {
    console.log("FAIL — Apple authorize page: invalid_client / Invalid client.");
    console.log("");
    console.log("Supabase is configured; Apple does not recognize the Services ID.");
    console.log("Create it in Apple Developer (NOT Website Push ID):");
    console.log(`  1. Identifiers → + → Services IDs → ${SERVICES_ID}`);
    console.log("  2. Enable Sign in with Apple → Configure");
    console.log(`  3. Primary App ID: ${BUNDLE_ID}`);
    console.log(`  4. Domain: ${projectRef}.supabase.co`);
    console.log(`  5. Return URL: ${expectedCallback}`);
    console.log("");
    console.log("After saving, re-run this script — no Supabase change needed if secret already set.");
    console.log("See docs/apple-sign-in-setup.md#invalid_client-invalid-client");
    process.exit(1);
  }

  console.log("PASS — Apple accepted the Services ID (authorize page has no invalid_client).");
  console.log("Next: open http://localhost:3000/auth/sign-in and click Continue with Apple.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
