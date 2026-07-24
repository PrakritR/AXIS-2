"use client";

import { applyDocumentTheme, readStoredTheme } from "@/lib/theme-storage";
import { useLayoutEffect } from "react";

/** Marketing and other public pages stay light; restore saved theme when leaving. */
export function PublicLightThemeLock() {
  useLayoutEffect(() => {
    applyDocumentTheme("light");
    return () => {
      applyDocumentTheme(readStoredTheme("light"));
    };
  }, []);

  return null;
}
