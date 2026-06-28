"use client";

import { useEffect } from "react";
import { getNativeInfo, registerPushIfGranted, resendCachedToken } from "@/lib/native/push-client";

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
      const { isNative, platform } = await getNativeInfo();
      if (disposed || !isNative) return;

      document.documentElement.setAttribute("data-native", platform);

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
        const resume = await App.addListener("resume", () => void resendCachedToken());
        cleanups.push(() => void resume.remove());
      } catch {
        /* app plugin unavailable — non-fatal */
      }
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
