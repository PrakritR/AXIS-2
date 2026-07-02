"use client";

import { detectNativePlatformSync } from "@/lib/native/detect-native";
import type { NativePlatform } from "@/lib/native/push-client";
import { useEffect, useState } from "react";

/** `ios` | `android` in the Capacitor app; `null` on the web. */
export function useNativePlatform(): NativePlatform | null {
  const [platform, setPlatform] = useState<NativePlatform | null>(null);

  useEffect(() => {
    const sync = detectNativePlatformSync();
    if (sync) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronous platform detection on mount
      setPlatform(sync);
      return;
    }
    void import("@/lib/native/push-client")
      .then(({ getNativeInfo }) => getNativeInfo())
      .then(({ isNative, platform: p }) => {
        setPlatform(isNative && p !== "web" ? p : null);
      })
      .catch(() => setPlatform(null));
  }, []);

  return platform;
}
