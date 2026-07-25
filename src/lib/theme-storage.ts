export const THEME_STORAGE_KEY = "axis:theme";

export type Theme = "light" | "dark";

/** Routes where users may persist and toggle light/dark (signed-in surfaces). */
export function isThemeToggleRoute(pathname: string): boolean {
  return /^\/(portal|resident|admin|vendor|auth)(\/|$)/.test(pathname);
}

export function readStoredTheme(fallback: Theme = "light"): Theme {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return fallback;
}

export function applyDocumentTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}
