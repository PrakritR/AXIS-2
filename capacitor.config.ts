import type { CapacitorConfig } from "@capacitor/cli";
import { nativeAuthEntryPathFromServerBase } from "./src/lib/auth/native-auth-entry";

/**
 * Axis ships as a native shell (Capacitor) that loads the live, server-rendered
 * site. The app relies on auth middleware, Stripe, and Supabase SSR, so it
 * cannot be statically exported — instead the native WebView points at
 * production and Capacitor injects its bridge so push, camera, status bar, etc.
 * work natively.
 *
 * Local development against a dev server (required to see unreleased mobile UI):
 *   CAP_SERVER_URL=http://127.0.0.1:3000 npx cap sync
 * On a physical device, use your LAN IP instead of 127.0.0.1.
 */
const serverBase = (process.env.CAP_SERVER_URL ?? "https://www.axis-seattle-housing.com").replace(/\/$/, "");
const nativeEntryPath = nativeAuthEntryPathFromServerBase(serverBase);
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
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#080b14",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
