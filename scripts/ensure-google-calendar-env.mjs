#!/usr/bin/env node
/**
 * Writes GOOGLE_CALENDAR_CLIENT_ID to .env.local (discovered from Supabase Google OAuth).
 * GOOGLE_CALENDAR_CLIENT_SECRET must be pasted from Supabase → Authentication → Providers → Google.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");

if (!existsSync(envPath)) {
  console.error(`Expected ${envPath} — run from the PropPlane project root.`);
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!url || !anon) {
  console.error("Load .env.local first (NEXT_PUBLIC_SUPABASE_URL and ANON_KEY required).");
  process.exit(1);
}

if (existsSync(envPath)) {
  const body = readFileSync(envPath, "utf8");
  if (/^GOOGLE_CALENDAR_CLIENT_ID=/m.test(body)) {
    console.log("GOOGLE_CALENDAR_CLIENT_ID already set in .env.local");
    process.exit(0);
  }
}

const res = await fetch(`${url}/auth/v1/authorize?provider=google`, {
  headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  redirect: "manual",
});
const location = res.headers.get("location") ?? "";
const match = location.match(/client_id=([^&]+)/);
if (!match) {
  console.error("Could not discover Google client ID from Supabase.");
  process.exit(1);
}

const clientId = decodeURIComponent(match[1]);
appendFileSync(
  envPath,
  `\n# Google Calendar sync (same OAuth client as Supabase Google provider)\nGOOGLE_CALENDAR_CLIENT_ID=${clientId}\n# GOOGLE_CALENDAR_CLIENT_SECRET=paste-from-supabase-google-provider\n`,
);
console.log(`Wrote GOOGLE_CALENDAR_CLIENT_ID to ${envPath}`);
console.log("Add GOOGLE_CALENDAR_CLIENT_SECRET from Supabase → Auth → Google, then restart the dev server.");
