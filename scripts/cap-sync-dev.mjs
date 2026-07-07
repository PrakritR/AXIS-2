#!/usr/bin/env node
/**
 * Sync Capacitor for local dev on simulator AND physical iPhone.
 * Physical devices cannot use localhost — they need the Mac's LAN IP.
 */
import { networkInterfaces } from "node:os";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const NATIVE_ENTRY_PATH = "/auth/sign-in";
const CAP_DEV_SERVER_MARKER = join(process.cwd(), ".cap-dev-server");

function firstLanIPv4() {
  try {
    for (const iface of Object.values(networkInterfaces())) {
      for (const addr of iface ?? []) {
        if (addr.family === "IPv4" && !addr.internal) return addr.address;
      }
    }
  } catch {
    /* sandbox or restricted env — fall back below */
  }
  return "127.0.0.1";
}

async function probeDevServer(entryUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(entryUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "text/html" },
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

const port = process.env.CAP_DEV_PORT?.trim() || "3000";
const host = process.env.CAP_SERVER_URL?.trim()
  ? new URL(process.env.CAP_SERVER_URL).origin
  : `http://${firstLanIPv4()}:${port}`;
const entryUrl = `${host}${NATIVE_ENTRY_PATH}`;

console.log(`Capacitor dev server: ${entryUrl}`);
if (host.includes("127.0.0.1") || host.includes("localhost")) {
  console.log("Tip: on a physical iPhone, set CAP_SERVER_URL to your Mac's LAN IP if this stays on localhost.\n");
} else {
  console.log("Phone and Mac must be on the same Wi‑Fi.\n");
}

writeFileSync(CAP_DEV_SERVER_MARKER, host, "utf8");

const result = spawnSync("npx", ["cap", "sync"], {
  stdio: "inherit",
  env: { ...process.env, CAP_SERVER_URL: host },
});

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

console.log("\nChecking dev server…");
const probe = await probeDevServer(entryUrl);
if (probe.ok) {
  console.log(`✓ Dev server reachable (${probe.status}). Open Xcode and Run (⌘R).`);
  console.log("  First load can take ~15s while Next.js compiles.\n");
  process.exit(0);
}

console.error("\n✗ Dev server is NOT reachable at:");
console.error(`  ${entryUrl}`);
if (probe.error) console.error(`  (${probe.error})`);
else if (probe.status) console.error(`  (HTTP ${probe.status})`);
console.error("\nCapacitor was synced, but the iOS app will show a blank screen / JS Eval error until the server is up.");
console.error("\nFix:");
console.error("  1. In another terminal: npm run dev");
console.error("  2. Wait for “Ready” (and Network URL to show your LAN IP)");
console.error("  3. Re-run the app in Xcode (⌘R)");
console.error("\nTo load production instead of local dev:");
console.error("  npm run cap:prod && rebuild in Xcode\n");
process.exit(1);
