"use client";

/** TEMPORARY lab-only theme toggle: flips [data-theme] on <html>. */
export function HeroLabThemeToggle() {
  return (
    <button
      type="button"
      data-attr="hero-lab-theme-toggle"
      onClick={() => {
        const root = document.documentElement;
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try {
          localStorage.setItem("theme", next);
        } catch {
          /* ignore */
        }
      }}
      style={{
        fontSize: 13,
        fontWeight: 500,
        padding: "7px 14px",
        borderRadius: 8,
        border: "1px solid var(--pl-line-strong)",
        background: "var(--pl-surface-raised)",
        color: "var(--pl-ink)",
        cursor: "pointer",
      }}
    >
      Toggle light / dark
    </button>
  );
}
