"use client";

import { detectNativePlatformSync } from "@/lib/native/detect-native";
import type { ReactNode } from "react";

/** Web-only chrome (marketing footer, navbar substrate, etc.) — not rendered in the app. */
export function HideOnNative({ children }: { children: ReactNode }) {
  if (detectNativePlatformSync()) return null;
  return children;
}
