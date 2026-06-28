"use client";

import { useEffect, useState } from "react";
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
    void getNativeInfo().then((info) => {
      if (active) setState({ isNative: info.isNative, platform: info.platform });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
