"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  applyDocumentTheme,
  readStoredTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme-storage";

export type { Theme } from "@/lib/theme-storage";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  mounted: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readThemeFromDocument(defaultTheme: Theme): Theme {
  if (typeof document === "undefined") return defaultTheme;
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return readStoredTheme(defaultTheme);
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);
  const synced = useRef(false);

  useLayoutEffect(() => {
    if (synced.current) return;
    synced.current = true;
    const initial = readThemeFromDocument(defaultTheme);
    applyDocumentTheme(initial);
    setThemeState(initial);
    setMounted(true);
  }, [defaultTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyDocumentTheme(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Sets surface default theme when user has no saved preference. */
export function SurfaceThemeDefault({ theme: surfaceDefault }: { theme: Theme }) {
  const ctx = useContext(ThemeContext);
  const applied = useRef(false);

  useLayoutEffect(() => {
    if (applied.current || typeof window === "undefined" || !ctx?.mounted) return;
    if (!window.localStorage.getItem(THEME_STORAGE_KEY)) {
      applied.current = true;
      applyDocumentTheme(surfaceDefault);
      ctx.setTheme(surfaceDefault);
    }
  }, [surfaceDefault, ctx?.mounted, ctx?.setTheme]);

  return null;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

export function useThemeOptional() {
  return useContext(ThemeContext);
}
