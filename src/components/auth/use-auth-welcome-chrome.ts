"use client";

import { useEffect } from "react";

/** Marks the document while the resident/manager role picker is shown — hides site header/footer chrome. */
export function useAuthWelcomeChrome(active = true): void {
  useEffect(() => {
    if (!active) return;
    document.documentElement.setAttribute("data-auth-welcome", "true");
    return () => {
      document.documentElement.removeAttribute("data-auth-welcome");
    };
  }, [active]);
}
