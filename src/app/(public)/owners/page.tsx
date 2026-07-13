import type { Metadata } from "next";
import Link from "next/link";
import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { RevealOnView } from "@/components/motion/reveal-on-view";

export const metadata: Metadata = {
  title: "For owners",
  description:
    "Own the rentals, hire the manager, keep the clarity. PropLane gives property owners transparent statements, real distributions, and double-entry books — free to get started, in beta.",
};

const FEATURES = [
  {
    eyebrow: "Statements & distributions",
    title: "Every dollar, accounted for",
    body: "Your manager posts an owner statement each period — rent collected, expenses paid, and the net that lands in your account. Distributions are tracked end to end, so you always know what was paid, when, and for which property.",
    bullets: [
      ["Per-property statements", "income, expenses, and net-to-owner, itemized."],
      ["Distribution tracking", "scheduled, processing, and paid — with dates."],
      ["No spreadsheet handoff", "the numbers come straight from the ledger."],
    ],
  },
  {
    eyebrow: "Accounting that holds up",
    title: "Real double-entry books",
    body: "PropLane runs a true double-entry general ledger — not a payments list dressed up as bookkeeping. Every charge, payment, and payout posts to accounts that balance, so the statement you read matches the books your accountant expects.",
    bullets: [
      ["Balanced ledger", "trial balance and balance sheet, always in balance."],
      ["Deposit trust", "security deposits book as a liability, not income."],
      ["Tax-ready", "Schedule E categories mapped from the start."],
    ],
  },
  {
    eyebrow: "Portfolio at a glance",
    title: "See your income and expenses",
    body: "Open the dashboard and see occupancy, portfolio income for the month, and what's been distributed to you — across every property you own. No login-and-ask-your-manager, no waiting until tax season to find out how the year went.",
    bullets: [
      ["One dashboard", "income, occupancy, and distributions in a glance."],
      ["Drill in anywhere", "from a KPI to the statement behind it."],
      ["Web + iOS", "the same clarity on your phone."],
    ],
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Your manager runs the day-to-day",
    body: "Listings, applications, leases, rent collection, maintenance, vendors — the manager works the portfolio in PropLane, the same way they run everything else.",
  },
  {
    n: "02",
    title: "The books post themselves",
    body: "Every rent payment, expense, and vendor payout lands in a double-entry ledger automatically. Nothing to reconcile by hand, nothing to copy between tools.",
  },
  {
    n: "03",
    title: "You get the clarity",
    body: "Statements, distributions, occupancy, and portfolio income show up on your owner dashboard — read-only, always current, no chasing anyone for a number.",
  },
] as const;

export default function OwnerPage() {
  return (
    <div>
      {/* ------------------------------ Hero ------------------------------ */}
      <section className="hero-chrome-scene relative overflow-hidden pb-16 pt-14 sm:pb-20 sm:pt-20 md:pt-24">
        <ChromeSubstrate variant="full" />
        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-5">
          <RevealOnView>
            <div className="hero-eyebrow mb-5 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md sm:mb-6 sm:px-4">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--steel-light)] shadow-[0_0_10px_rgba(188,212,255,0.9)]" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em] sm:text-[13px]">
                For property owners
              </span>
            </div>

            <h1 className="hero-title mx-auto max-w-4xl text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[3.5rem] md:text-[4rem]">
              Your manager runs it.{" "}
              <span className="text-gradient-accent">You keep the clarity.</span>
            </h1>

            <p className="hero-subtitle mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg">
              You own the rentals and hire a manager to handle the day-to-day. PropLane gives you
              the other half: transparent owner statements, real distributions, and double-entry
              books you can actually trust — free to get started, and in beta.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/create-account"
                data-attr="owner-hero-get-started"
                className="btn-metallic hero-cta-metallic inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full px-9 py-3.5 text-[15px] font-semibold transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-px active:scale-[0.99] sm:w-auto"
              >
                Get started for free
              </Link>
              <Link
                href="/demo"
                data-attr="owner-hero-see-how"
                className="hero-cta-outline inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full border px-9 py-3.5 text-[15px] font-semibold transition-colors duration-200 active:scale-[0.99] sm:w-auto"
              >
                See how it works
              </Link>
            </div>
          </RevealOnView>
        </div>
      </section>

      {/* ------------------- Intro: the clarity gap + mock ------------------- */}
      <section className="relative overflow-hidden py-14 sm:py-20">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <RevealOnView>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                The clarity gap
              </p>
              <h2 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[2.5rem]">
                Ownership shouldn&rsquo;t mean guessing
              </h2>
              <div className="mt-4 space-y-4 text-base leading-relaxed text-muted sm:text-lg">
                <p>
                  Most owners find out how the year went at tax time. Rent lands in one system,
                  expenses in another, and the &ldquo;statement&rdquo; is a spreadsheet someone
                  retyped by hand — if it arrives at all.
                </p>
                <p className="text-foreground">
                  PropLane closes that gap. The same platform your manager uses to run the property
                  produces your statements and distributions directly from the ledger, so what you
                  read is what actually happened.
                </p>
              </div>
            </RevealOnView>

            <RevealOnView delayMs={80}>
              {/* Illustrative owner-statement mock — sample figures, not real data. */}
              <div className="glass-card rounded-2xl p-6 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Owner statement</p>
                    <p className="text-xs text-muted">June 2026 · 1208 Pine St</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                    Ready
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-[1fr_auto] gap-x-5 gap-y-2.5 text-sm tabular-nums">
                  <span className="text-muted">Rent collected</span>
                  <span className="text-right text-foreground">5,600</span>

                  <span className="text-muted">Management fee</span>
                  <span className="text-right text-muted">(560)</span>

                  <span className="text-muted">Maintenance &amp; repairs</span>
                  <span className="text-right text-muted">(420)</span>

                  <span className="text-muted">Reserve held</span>
                  <span className="text-right text-muted">(500)</span>

                  <span className="col-span-2 my-1 border-t border-border/60" aria-hidden />

                  <span className="font-semibold text-foreground">Net distribution</span>
                  <span className="text-right font-semibold text-foreground">$4,120</span>
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-confirmed-fg)]" aria-hidden />
                  Every line traces back to the general ledger
                </p>
              </div>
            </RevealOnView>
          </div>
        </div>
      </section>

      {/* --------------------------- Feature blocks --------------------------- */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl space-y-16 px-4 sm:px-5 lg:space-y-24">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="grid items-start gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-16"
            >
              <RevealOnView>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                  {feature.eyebrow}
                </p>
                <h2 className="mt-3 text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.03em] text-foreground sm:text-4xl">
                  {feature.title}
                </h2>
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
                  {feature.body}
                </p>
              </RevealOnView>

              <RevealOnView delayMs={80}>
                <ul className="grid gap-3 sm:grid-cols-1">
                  {feature.bullets.map(([label, detail]) => (
                    <li
                      key={label}
                      className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                          aria-hidden
                        >
                          {String(i + 1)}
                        </span>
                        <p className="text-sm leading-relaxed text-muted">
                          <strong className="font-semibold text-foreground">{label}</strong>{" "}
                          — {detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </RevealOnView>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------- How it works ----------------------------- */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <RevealOnView>
            <h2 className="mx-auto max-w-2xl text-center text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[2.5rem]">
              One platform, two roles
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-muted sm:text-base">
              Your manager does the work. The books do the math. You get the clarity.
            </p>
          </RevealOnView>

          <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <RevealOnView key={step.n} delayMs={i * 60} className="h-full">
                <div className="glass-card flex h-full flex-col rounded-2xl p-7">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                    {step.n}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{step.body}</p>
                </div>
              </RevealOnView>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- Honest beta strip --------------------------- */}
      <section className="relative overflow-hidden py-8 sm:py-10">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <RevealOnView>
            <div className="glass-card flex flex-col items-start gap-3 rounded-2xl px-6 py-5 sm:flex-row sm:items-center sm:gap-5 sm:py-6">
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                In beta
              </span>
              <p className="text-sm leading-relaxed text-muted">
                PropLane is built in Seattle by property managers running their own units, and it&rsquo;s
                early — new owner-facing views are shipping now. It&rsquo;s free to get started, with no
                card required, so you can see the books before you commit.
              </p>
            </div>
          </RevealOnView>
        </div>
      </section>

      {/* ----------------------------- CTA band ----------------------------- */}
      <section className="hero-chrome-scene relative overflow-hidden py-16 sm:py-24">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-5">
          <RevealOnView>
            <h2 className="hero-title mx-auto max-w-2xl text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.75rem]">
              See your portfolio the way it should look
            </h2>
            <p className="hero-subtitle mx-auto mt-4 max-w-xl text-base leading-relaxed sm:text-lg">
              Start free, no card required — or explore a live portfolio in the demo first.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/create-account"
                data-attr="owner-cta-get-started"
                className="btn-metallic hero-cta-metallic inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full px-9 py-3.5 text-[15px] font-semibold transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-px active:scale-[0.99] sm:w-auto"
              >
                Get started for free
              </Link>
              <Link
                href="/demo"
                data-attr="owner-cta-see-how"
                className="hero-cta-outline inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full border px-9 py-3.5 text-[15px] font-semibold transition-colors duration-200 active:scale-[0.99] sm:w-auto"
              >
                See how it works
              </Link>
            </div>
          </RevealOnView>
        </div>
      </section>
    </div>
  );
}
