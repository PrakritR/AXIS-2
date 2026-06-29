import type { CapacitorConfig } from "@capacitor/cli";
import { nativeShellEntryPath } from "./src/lib/auth/native-shell-entry";

/**
 * Capacitor native shell — loads the deployed site but opens /auth/welcome (not
 * the web sign-in). Local dev: npm run cap:dev (LAN IP for physical iPhone).
 */
const serverBase = (process.env.CAP_SERVER_URL ?? "https://www.axis-seattle-housing.com").replace(/\/$/, "");
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
    contentInset: "always",
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
