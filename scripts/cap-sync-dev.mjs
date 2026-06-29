#!/usr/bin/env node
/**
 * Sync Capacitor for local dev on simulator AND physical iPhone.
 * Physical devices cannot use localhost — they need the Mac's LAN IP.
 */
import { networkInterfaces } from "node:os";
import { spawnSync } from "node:child_process";

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

const port = process.env.CAP_DEV_PORT?.trim() || "3000";
const host = process.env.CAP_SERVER_URL?.trim()
  ? new URL(process.env.CAP_SERVER_URL).origin
  : `http://${firstLanIPv4()}:${port}`;

console.log(`Capacitor dev server: ${host}`);
if (host.includes("127.0.0.1") || host.includes("localhost")) {
  console.log("Tip: on a physical iPhone, set CAP_SERVER_URL to your Mac's LAN IP if this stays on localhost.\n");
} else {
  console.log("Ensure npm run dev is running and iPhone is on the same Wi‑Fi.\n");
}

const result = spawnSync("npx", ["cap", "sync"], {
  stdio: "inherit",
  env: { ...process.env, CAP_SERVER_URL: host },
});

process.exit(result.status ?? 1);
