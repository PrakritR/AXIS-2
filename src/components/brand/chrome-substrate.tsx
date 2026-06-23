/** Blue Steel chrome substrate — full (animated) or quiet (static) variants. */
export function ChromeSubstrate({ variant = "quiet" }: { variant?: "full" | "quiet" }) {
  if (variant === "quiet") {
    return (
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background" aria-hidden>
        <div className="chrome-substrate-quiet-glow absolute inset-0" />
      </div>
    );
  }

  return (
    <div className="chrome-substrate-full pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="chrome-substrate-full__flow chrome-flow absolute inset-[-55%]" />
      <div className="chrome-substrate-full__overlay chrome-shift absolute inset-[-55%]" />
      <div className="chrome-substrate-full__gloss absolute inset-x-0 top-0" />
      <div className="chrome-substrate-full__wash absolute inset-0" />
      <div className="chrome-substrate-full__line absolute inset-x-0 top-0" />
    </div>
  );
}

/** Portal content area quiet substrate — corner glow only. */
export function PortalContentSubstrate() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-background" />
      <div
        className="absolute inset-0 opacity-100 [html[data-theme=light]_&]:opacity-0"
        style={{ background: "var(--portal-surface-dark)" }}
      />
      <div
        className="absolute inset-0 opacity-0 [html[data-theme=light]_&]:opacity-100"
        style={{ background: "var(--portal-surface-light)" }}
      />
      <div className="chrome-substrate-quiet-glow absolute inset-0" />
    </div>
  );
}
