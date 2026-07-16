#!/usr/bin/env node
/**
 * Push Twilio env vars from .env.local to Vercel (production + preview + development).
 *
 *   node --env-file=.env.local scripts/sync-twilio-vercel-env.mjs
 *
 * Requires: vercel CLI linked to project axis-2 (`npx vercel link --project axis-2`).
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ENV_FILE = resolve(ROOT, ".env.local");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_VERIFY_SERVICE_SID",
  "TWILIO_WEBHOOK_URL",
];

const TARGET_ENVS = ["production", "preview", "development"];
const fileEnv = parseEnvFile(ENV_FILE);
const env = { ...fileEnv, ...process.env };

const missing = KEYS.filter((k) => !String(env[k] ?? "").trim());
if (missing.length) {
  console.error("Missing in .env.local:", missing.join(", "));
  console.error("Set TWILIO_AUTH_TOKEN from Twilio Console → Account → API credentials → Primary auth token.");
  process.exit(1);
}

function vercel(args, input) {
  const result = spawnSync("npx", ["vercel", ...args], {
    cwd: ROOT,
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result;
}

for (const key of KEYS) {
  const value = String(env[key]).trim();
  for (const target of TARGET_ENVS) {
    vercel(["env", "rm", key, target, "--yes"], "");
    const add = vercel(["env", "add", key, target, "--yes"], value);
    if (add.status !== 0) {
      console.error(`Failed ${key} (${target}):`, add.stderr || add.stdout);
      process.exit(1);
    }
    console.log(`✓ ${key} → ${target}`);
  }
}

console.log("\nDone. Redeploy production/preview for changes to take effect.");
