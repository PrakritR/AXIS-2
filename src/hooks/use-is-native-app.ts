"use client";

import { useEffect, useState } from "react";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { getNativeInfo, type NativePlatform } from "@/lib/native/push-client";

/**
 * Whether the app is running inside the Capacitor native shell, plus the
 * platform. Both are `null` until resolved after mount, so SSR/web render the
 * "not native" path and avoid hydration mismatches.
 */
export function useIsNativeApp(): { isNative: boolean | null; platform: NativePlatform | null } {
  const [state, setState] = useState<{ isNative: boolean | null; platform: NativePlatform | null }>({
    isNative: null,
    platform: null,
  });

  useEffect(() => {
    let active = true;

    // Prefer the synchronous bridge-marker check (same one the <head> script
    // and NativeBridge use) — it's immediate and can't race or silently swallow
    // a chunk-load failure. Only fall back to the async @capacitor/core import
    // (getNativeInfo) when the sync check is inconclusive, e.g. `window.Capacitor`
    // hasn't attached its bridge markers yet. Without this, a stalled/failed
    // dynamic import left `isNative` stuck at `false` while the <head> script's
    // sync check had already set `data-native` — CSS hid the mobile top nav via
    // `html[data-native] .portal-mobile-chrome` but the bottom bar (gated on
    // this hook's async state) never rendered, leaving the native bar empty.
    const syncPlatform = detectNativePlatformSync();
    if (syncPlatform) {
      // Deferred to a microtask (not a direct setState-in-effect) — same
      // pattern as useCoManagerNavSections, avoids a cascading-render lint
      // warning without reintroducing a render-phase check.
      void Promise.resolve().then(() => {
        if (active) setState({ isNative: true, platform: syncPlatform });
      });
      return () => {
        active = false;
      };
    }

    void getNativeInfo()
      .then((info) => {
        if (active) setState({ isNative: info.isNative, platform: info.platform });
      })
      .catch(() => {
        if (active) setState({ isNative: false, platform: "web" });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

/** True only after mount when running in the Capacitor shell — safe for layout branching. */
export function useNativeChrome(): boolean {
  const { isNative } = useIsNativeApp();
  return isNative === true;
}
