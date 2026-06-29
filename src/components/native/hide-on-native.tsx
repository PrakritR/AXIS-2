"use client";

import { useIsNativeApp } from "@/hooks/use-is-native-app";
import type { ReactNode } from "react";

/** Web-only chrome (marketing footer, navbar substrate, etc.) — not rendered in the app. */
export function HideOnNative({ children }: { children: ReactNode }) {
  const { isNative } = useIsNativeApp();
  if (isNative === true) return null;
  return children;
}
