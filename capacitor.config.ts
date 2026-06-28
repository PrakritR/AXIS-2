import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Axis ships as a native shell (Capacitor) that loads the live, server-rendered
 * site. The app relies on auth middleware, Stripe, and Supabase SSR, so it
 * cannot be statically exported — instead the native WebView points at
 * production and Capacitor injects its bridge so push, camera, status bar, etc.
 * work natively.
 *
 * Local development against a dev server:
 *   CAP_SERVER_URL=http://<your-LAN-ip>:3000 npx cap sync
 * Point the simulator/device at your machine instead of production.
 */
const serverUrl = process.env.CAP_SERVER_URL ?? "https://www.axis-seattle-housing.com";

const config: CapacitorConfig = {
  appId: "com.axisseattlehousing.app",
  appName: "Axis",
  // Capacitor requires a webDir with an index.html even in hosted mode.
  // Ours doubles as the branded offline fallback screen.
  webDir: "native-shell",
  server: {
    url: serverUrl,
    // Needed only when pointing at an http:// dev server (iOS ATS / Android cleartext).
    cleartext: serverUrl.startsWith("http://"),
    // Origins that stay inside the WebView; anything else opens the system browser.
    allowNavigation: [
      "www.axis-seattle-housing.com",
      "axis-seattle-housing.com",
      "*.supabase.co",
      "*.supabase.in",
      "js.stripe.com",
      "checkout.stripe.com",
      "*.stripe.com",
    ],
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
