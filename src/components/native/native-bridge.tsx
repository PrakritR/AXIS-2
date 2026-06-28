"use client";

import { isNativeDeepLinkPath } from "@/lib/auth/native-entry-paths";
import { redirectNativeFromMarketing } from "@/lib/auth/native-welcome-redirect";
import { detectNativePlatformSync, tagHtmlNativePlatform } from "@/lib/native/detect-native";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getNativeInfo, registerPushIfGranted, resendCachedToken } from "@/lib/native/push-client";
import { useEffect } from "react";

async function redirectNativeFromMarketingPage(): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  await redirectNativeFromMarketing(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return { session };
  });
}

/**
 * Runs only inside the Capacitor native shell (the iOS/Android app). On the web
 * it renders nothing and does no work — Capacitor modules are imported lazily.
 *
 * On native it:
 *  - tags <html data-native="ios|android"> so web CSS/components can adapt;
 *  - hides the splash once the web app has mounted and styles the status bar;
 *  - registers push only if already granted (the resident "Enable
 *    notifications" toggle drives first-time opt-in — no launch nag);
 *  - re-sends the token on resume (covers "registered before sign-in").
 */
export function NativeBridge() {
  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      const syncPlatform = detectNativePlatformSync();
      const { isNative, platform } = syncPlatform
        ? { isNative: true as const, platform: syncPlatform }
        : await getNativeInfo();
      if (disposed || !isNative) return;

      tagHtmlNativePlatform(platform);

      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        /* splash plugin unavailable — non-fatal */
      }

      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark });
        if (platform === "android") {
          await StatusBar.setBackgroundColor({ color: "#080b14" });
        }
      } catch {
        /* status bar plugin unavailable — non-fatal */
      }

      try {
        await registerPushIfGranted();
      } catch (err) {
        console.error("Push registration failed", err);
      }

      try {
        const { App } = await import("@capacitor/app");
        const resume = await App.addListener("resume", () => {
          void resendCachedToken();
          void redirectNativeFromMarketingPage();
        });
        cleanups.push(() => void resume.remove());

        const urlOpen = await App.addListener("appUrlOpen", (event) => {
          try {
            const opened = new URL(event.url);
            if (!isNativeDeepLinkPath(opened.pathname)) return;
            const target = `${opened.pathname}${opened.search}${opened.hash}`;
            window.location.assign(target);
          } catch {
            /* ignore malformed deep links */
          }
        });
        cleanups.push(() => void urlOpen.remove());
      } catch {
        /* app plugin unavailable — non-fatal */
      }

      await redirectNativeFromMarketingPage();
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
