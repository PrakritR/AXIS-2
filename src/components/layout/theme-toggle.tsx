"use client";

import { useThemeOptional } from "@/components/providers/theme-provider";

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19 5l-1.8 1.8M6.8 17.2L5 19M19 19l-1.8-1.8M6.8 6.8L5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const ctx = useThemeOptional();
  if (!ctx?.mounted) {
    return (
      <div
        className={`inline-flex h-9 w-16 items-center rounded-full border border-border bg-card/60 p-0.5 ${className}`}
        aria-hidden
      />
    );
  }

  const { theme, setTheme } = ctx;

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full border border-border bg-card/60 p-0.5 ${className}`}
      role="group"
      aria-label="Theme"
    >
      <button
        type="button"
        aria-label="Light theme"
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${
          theme === "light"
            ? "bg-primary text-white shadow-sm"
            : "text-muted hover:text-foreground"
        }`}
      >
        <SunIcon />
      </button>
      <button
        type="button"
        aria-label="Dark theme"
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${
          theme === "dark"
            ? "bg-primary text-white shadow-sm"
            : "text-muted hover:text-foreground"
        }`}
      >
        <MoonIcon />
      </button>
    </div>
  );
}
