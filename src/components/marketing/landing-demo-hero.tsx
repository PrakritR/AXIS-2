import Link from "next/link";
import { HomepageDemoEmbed } from "@/components/marketing/homepage-demo-embed";
import { SignedOutOnly } from "@/components/marketing/signed-out-only";
import { RevealOnView } from "@/components/motion/reveal-on-view";

/**
 * Landing page — "Split Statement" (Linear-inspired light).
 *
 * Left: the core promise as an oversized statement + CTAs. Right: a live
 * "Needs attention" product panel that proves the product is real. The
 * interactive demo lives below the fold. Styling is self-contained light
 * (near-white #fbfbfc, indigo accent) so it never touches the signed-in portal
 * theme. The shared navbar (Log in / Get started, or Portal when signed in)
 * sits on top.
 */
export function LandingDemoHero() {
  return (
    <section className="relative overflow-hidden bg-background text-foreground">
      {/* Subtle indigo mesh glow behind the fold. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] max-w-[130%] -translate-x-1/2 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--primary) 12%, transparent), color-mix(in srgb, var(--primary) 5%, transparent) 42%, transparent 70%)",
          filter: "blur(48px)",
        }}
      />

      {/* Full-viewport fold: statement (left) + product panel (right). */}
      <div className="relative flex min-h-[calc(100svh-57px-env(safe-area-inset-top,0px))] items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-20 sm:px-6 lg:grid-cols-[1.08fr_1fr] lg:gap-16">
          {/* Statement */}
          <RevealOnView>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-[var(--secondary)] px-3 py-1 text-[12px] font-medium tracking-[0.06em] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_color-mix(in_srgb,var(--primary)_50%,transparent)]" />
              PROPLANE · IN BETA
            </span>
            <h1 className="mt-6 text-[2.9rem] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[3.6rem] lg:text-[4rem]">
              The AI does
              <br />
              the busywork.
              <br />
              <span className="text-muted/60">You approve.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15.5px] leading-relaxed text-muted">
              One platform for managers, residents, and vendors. It drafts leases from applications,
              collects rent, chases late fees, and pays vendors — then hands you a single queue to
              approve. Real double-entry books underneath.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/create-account?mode=create&role=manager"
                data-attr="home-hero-get-started"
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[7px] border border-border bg-primary px-6 text-[14.5px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition hover:brightness-110 active:scale-[0.99]"
              >
                Get started for free
              </Link>
              <Link
                href="/contact"
                data-attr="home-hero-book-demo"
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[7px] border border-border bg-transparent px-6 text-[14.5px] font-medium text-foreground transition hover:border-foreground/20 hover:bg-[var(--secondary)]"
              >
                Book a demo
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-muted">
              {["14-day Pro trial", "No signup demo", "Free plan, $0"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <CheckIcon />
                  {t}
                </span>
              ))}
            </div>
          </RevealOnView>

          {/* Live "Needs attention" product panel */}
          <RevealOnView delayMs={90}>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <div className="text-[14px] font-semibold tracking-[-0.01em]">Needs attention</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-[0.07em] text-muted/60">
                    Manager · The Pioneer
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[var(--secondary)] px-2.5 py-1 text-[11px] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-confirmed-fg)]" />4 open
                </span>
              </div>
              <div className="divide-y divide-[var(--border)]">
                <PanelRow dot="var(--status-overdue-fg)" title="2 rent payments" muted="overdue" meta="$5,150 · late fee" />
                <PanelRow dot="var(--status-pending-fg)" title="5 applications" muted="pending review" meta="3 pre-screened" />
                <PanelRow dot="var(--primary)" title="3 leases" muted="drafted by AI" meta="awaiting approval" />
                <PanelRow dot="var(--status-confirmed-fg)" title="Work order #142" muted="vendor bid" meta="$480 · accept" />
              </div>
              <div className="flex items-center gap-2.5 border-t border-border px-5 py-3.5">
                <span className="text-primary" aria-hidden>
                  ✦
                </span>
                <span className="min-w-0 text-[12.5px] leading-snug text-muted">
                  Every AI action is previewed — nothing sends without your OK.
                </span>
                <kbd className="ml-auto rounded border border-border bg-[var(--secondary)] px-1.5 py-0.5 text-[11px] text-muted">
                  ↵
                </kbd>
              </div>
            </div>
          </RevealOnView>
        </div>

        {/* Scroll cue */}
        <a
          href="#live-demo"
          data-attr="home-hero-scroll-to-demo"
          className="absolute inset-x-0 bottom-5 mx-auto flex w-fit flex-col items-center gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted/60 transition-colors hover:text-muted"
        >
          <span>Try the live demo</span>
          <span aria-hidden className="animate-bounce text-sm leading-none">
            ↓
          </span>
        </a>
      </div>

      {/* Below the fold: the real interactive portal (or a return-to-portal panel). */}
      <div id="live-demo" className="relative scroll-mt-16 pb-16 pt-4">
        <HomepageDemoEmbed />
        {/* Closing conversion CTAs — signed-out visitors only. */}
        <SignedOutOnly>
          <div className="mx-auto mt-8 max-w-6xl px-5 text-center sm:px-6">
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/create-account?mode=create&role=manager"
                data-attr="home-hero-get-started-bottom"
                className="inline-flex min-h-[44px] items-center justify-center rounded-[7px] border border-border bg-primary px-6 text-[14px] font-medium text-white transition hover:brightness-110"
              >
                Get started for free
              </Link>
              <Link
                href="/contact"
                data-attr="home-hero-book-demo"
                className="inline-flex min-h-[44px] items-center justify-center rounded-[7px] border border-border bg-transparent px-6 text-[14px] font-medium text-foreground transition hover:border-foreground/20 hover:bg-[var(--secondary)]"
              >
                Book a demo
              </Link>
            </div>
            <p className="mt-4 text-[12.5px] text-muted/60">
              Your real portfolio sets up in minutes — 14-day free trial, no card required.
            </p>
          </div>
        </SignedOutOnly>
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--status-confirmed-fg)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

function PanelRow({
  dot,
  title,
  muted,
  meta,
}: {
  dot: string;
  title: string;
  muted: string;
  meta: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="min-w-0 truncate text-[13.5px]">
        <span className="font-semibold text-foreground">{title}</span>{" "}
        <span className="text-muted">{muted}</span>
      </span>
      <span className="ml-auto shrink-0 text-[12.5px] tabular-nums text-muted">{meta}</span>
      <span className="shrink-0 text-muted/60" aria-hidden>
        ›
      </span>
    </div>
  );
}
