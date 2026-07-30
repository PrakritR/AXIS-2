"use client";

import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { applyDocumentTheme, readStoredTheme } from "@/lib/theme-storage";
import { useEffect } from "react";

/** Marks the document while portal auth is shown — hides site header/footer chrome. */
export function useAuthWelcomeChrome(active = true): void {
  useEffect(() => {
    if (!active) return;
    const isNative = detectNativePlatformSync();
    const previousTheme = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-auth-welcome", "true");
    if (isNative) {
      document.documentElement.setAttribute("data-auth-native", "true");
      // Native auth defaults to light; only dark when the user chose it in a portal.
      applyDocumentTheme(readStoredTheme("light"));
    }
    return () => {
      document.documentElement.removeAttribute("data-auth-welcome");
      document.documentElement.removeAttribute("data-auth-native");
      if (isNative && (previousTheme === "light" || previousTheme === "dark")) {
        applyDocumentTheme(previousTheme);
      }
    };
  }, [active]);
}
