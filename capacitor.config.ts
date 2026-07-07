import type { CapacitorConfig } from "@capacitor/cli";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nativeShellEntryPath } from "./src/lib/auth/native-shell-entry";

const CAP_DEV_SERVER_MARKER = join(process.cwd(), ".cap-dev-server");

function readServerBase(): string {
  const fromEnv = process.env.CAP_SERVER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    if (existsSync(CAP_DEV_SERVER_MARKER)) {
      const persisted = readFileSync(CAP_DEV_SERVER_MARKER, "utf8").trim();
      if (persisted) return persisted.replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  return "https://www.axis-seattle-housing.com";
}

/**
 * Capacitor native shell — opens /auth/sign-in (welcome role picker on device).
 * Local dev: npm run cap:dev (LAN IP for physical iPhone).
 * `cap run ios` re-syncs from this file — dev URL persists via `.cap-dev-server`
 * written by cap:dev until `npm run cap:prod`.
 */
const serverBase = readServerBase();
const nativeEntryPath = nativeShellEntryPath();
const nativeAppUrl = `${serverBase}${nativeEntryPath}`;

function allowNavigationHosts(): string[] {
  const hosts = [
    "www.axis-seattle-housing.com",
    "axis-seattle-housing.com",
    "localhost",
    "*.supabase.co",
    "*.supabase.in",
    "accounts.google.com",
    "*.google.com",
    "js.stripe.com",
    "checkout.stripe.com",
    "connect.stripe.com",
    "*.stripe.com",
  ];
  try {
    const devHost = new URL(serverBase).hostname;
    if (devHost && !hosts.includes(devHost)) hosts.unshift(devHost);
  } catch {
    /* ignore */
  }
  return hosts;
}

const config: CapacitorConfig = {
  appId: "com.axisseattlehousing.app",
  appName: "Axis",
  // Capacitor requires a webDir with an index.html even in hosted mode.
  // Ours doubles as the branded offline fallback screen.
  webDir: "native-shell",
  server: {
    url: nativeAppUrl,
    // Needed only when pointing at an http:// dev server (iOS ATS / Android cleartext).
    cleartext: serverBase.startsWith("http://"),
    // Origins that stay inside the WebView; anything else opens the system browser.
    allowNavigation: allowNavigationHosts(),
  },
  ios: {
    // Full-bleed WebView; safe areas come from viewport-fit=cover + CSS env(safe-area-inset-*).
    contentInset: "never",
    backgroundColor: "#080b14",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#080b14",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
