import type { Metadata } from "next";
import { LandingDemoHero, type HeroBgVariant } from "@/components/marketing/landing-demo-hero";
import { HeroLabThemeToggle } from "./theme-toggle";

/**
 * TEMPORARY hero-background lab. Renders every candidate once so the captain can
 * compare them in both themes on `/dev/hero-lab`. Deleted in stage 2 once a
 * winner is folded into the live hero. Never indexed.
 */
export const metadata: Metadata = {
  title: "Hero background lab",
  robots: { index: false, follow: false },
};

const CANDIDATES: { n: number; variant: HeroBgVariant; name: string; blurb: string }[] = [
  { n: 1, variant: "grid", name: "Architectural grid + bloom", blurb: "1px lattice with a masked radial fade, one brand bloom behind the panel, a few softly-lit cells." },
  { n: 2, variant: "aurora", name: "Aurora mesh", blurb: "Four heavily-blurred colour bodies drifting on long offset loops, GPU-composited." },
  { n: 3, variant: "paths", name: "Flight paths", blurb: "Dotted arcs sweeping lower-left → upper-right onto a glowing node — the paper-plane wake at wall scale." },
  { n: 4, variant: "film", name: "Film plane", blurb: "feTurbulence grain, an off-canvas top-right bloom, a brand hairline, and a bottom vignette." },
  { n: 5, variant: "spotlight", name: "Panel spotlight", blurb: "Elliptical glow behind the panel throwing a soft cone leftward, plus a reflected pool beneath." },
];

export default function HeroLabPage() {
  return (
    <main style={{ background: "var(--pl-surface)" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "12px 20px",
          background: "color-mix(in srgb, var(--pl-surface) 88%, transparent)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--pl-line)",
          color: "var(--pl-ink)",
        }}
      >
        <strong style={{ fontSize: 14, letterSpacing: "-0.01em" }}>
          Hero background lab — 5 candidates
        </strong>
        <HeroLabThemeToggle />
      </header>

      {CANDIDATES.map((c) => (
        <section key={c.variant} style={{ borderBottom: "1px solid var(--pl-line)" }}>
          <div
            style={{
              maxWidth: 1120,
              margin: "0 auto",
              padding: "18px 20px 4px",
              color: "var(--pl-ink)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--pl-accent)" }}>
              Candidate {c.n}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>{c.name}</div>
            <p style={{ fontSize: 13.5, color: "var(--pl-muted-fg)", maxWidth: "64ch", marginTop: 4 }}>
              {c.blurb}
            </p>
          </div>
          <LandingDemoHero bgVariant={c.variant} />
        </section>
      ))}
    </main>
  );
}
