import type { Metadata } from "next";
import Link from "next/link";
import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { RevealOnView } from "@/components/motion/reveal-on-view";

export const metadata: Metadata = {
  title: "Why PropLane",
  description:
    "AI drafts the work, you approve it. Try all three portals in a live demo, and run real double-entry books — leases, rent, maintenance, and accounting in one platform.",
};

const OLD_WAY = [
  "Retype application answers into a lease template, print, chase signatures.",
  "Text tenants about rent, track who paid in a spreadsheet, argue about late fees.",
  "Play phone tag with three contractors to get one quote.",
  "Reconcile a shoebox of receipts into something tax-ready every spring.",
  "Dig through old email for the insurance certificate that expired last month.",
] as const;

const PROPLANE_WAY = [
  "AI drafts the lease from the application — you review, then both sides e-sign.",
  "Rent collects online via Stripe, with automatic reminders and late fees.",
  "Work orders go out for vendor bids; approved work pays out through Stripe.",
  "Double-entry books post themselves: trial balance, owner statements, deposit trust.",
  "Document library tracks expirations and reminds you before they lapse.",
] as const;

const PRICING_TIERS = [
  { name: "Free", price: "$0", cadence: "forever", listings: "1 listing", fee: "0.5% payment fee" },
  { name: "Pro", price: "$20", cadence: "/mo", listings: "2 listings", fee: "0.25% payment fee" },
  { name: "Business", price: "$200", cadence: "/mo", listings: "20 listings", fee: "0% payment fee" },
] as const;

export default function WhyPropLanePage() {
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
                Why PropLane
              </span>
            </div>

            <h1 className="hero-title mx-auto max-w-4xl text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[3.5rem] md:text-[4rem]">
              The platform that does the work —{" "}
              <span className="text-gradient-accent">and shows you first</span>
            </h1>

            <p className="hero-subtitle mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg">
              PropLane&rsquo;s AI drafts leases, chases rent, and coordinates repairs — but every
              action waits for your explicit approval and lands in the audit log. Built in Seattle,
              in beta, and open to try right now without an account.
            </p>
          </RevealOnView>
        </div>
      </section>

      {/* ----------------------- Three differentiators ----------------------- */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl space-y-20 px-4 sm:px-5 lg:space-y-28">
          {/* 1 — AI drafts, you approve */}
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <RevealOnView>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Approval-first AI
              </p>
              <h2 className="mt-3 text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.03em] text-foreground sm:text-4xl">
                AI drafts, you approve
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
                The assistant turns application answers into a ready-to-sign lease, queues rent
                reminders, and lines up vendors for repairs. It never acts on its own: every write
                is previewed for you first, and every approval is audit-logged.
              </p>
              <ul className="mt-6 space-y-3 text-sm leading-relaxed text-muted">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>
                    <strong className="font-semibold text-foreground">Leases from applications</strong>{" "}
                    — terms filled in from the applicant&rsquo;s answers, e-signed by both sides.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>
                    <strong className="font-semibold text-foreground">Rent reminders</strong> — drafted
                    and scheduled by AI, sent only after you say so.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>
                    <strong className="font-semibold text-foreground">Vendor coordination</strong> —
                    the assistant proposes the outreach; you confirm before anything goes out.
                  </span>
                </li>
              </ul>
            </RevealOnView>

            <RevealOnView delayMs={80}>
              <div className="glass-card rounded-2xl p-6 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                    <span className="text-sm font-semibold text-foreground">PropLane Assistant</span>
                  </div>
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-500">
                    Awaiting your approval
                  </span>
                </div>
                <div className="mt-5 rounded-xl border border-border/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Lease draft ready
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-foreground">
                    1208 Pine St · Unit 3
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Terms filled from the approved application. Nothing is sent until you review it.
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white">
                    Review &amp; approve
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted">
                    Make changes
                  </span>
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                  Every approval is written to the audit log
                </p>
              </div>
            </RevealOnView>
          </div>

          {/* 2 — Try the real thing (visual left on lg) */}
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <RevealOnView className="lg:order-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                No signup required
              </p>
              <h2 className="mt-3 text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.03em] text-foreground sm:text-4xl">
                Try the real thing before you sign up
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
                Most platforms show you screenshots. PropLane hands you the keys: a live sandbox
                with all three portals — manager, resident, and vendor — loaded with sample data.
                Run a guided tour or ask the real AI assistant to do something and watch it wait
                for your approval.
              </p>
              <Link
                href="/demo"
                data-attr="why-proplane-open-demo"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors duration-200 hover:gap-2"
              >
                Open the live demo
                <span aria-hidden>→</span>
              </Link>
            </RevealOnView>

            <RevealOnView delayMs={80} className="lg:order-1">
              <Link
                href="/demo"
                data-attr="why-proplane-demo-card"
                className="glass-card block cursor-pointer rounded-2xl p-6 transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-[var(--shadow-card-hover)] sm:p-7"
              >
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white">
                    Manager
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted">
                    Resident
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted">
                    Vendor
                  </span>
                </div>
                <div className="mt-5 rounded-xl border border-border/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Guided tour
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-foreground">
                    Draft a lease with AI — step 2 of 5
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/15">
                    <div className="h-full w-2/5 rounded-full bg-primary" aria-hidden />
                  </div>
                </div>
                <p className="mt-4 text-[11px] font-medium text-muted">
                  Live sandbox · real AI assistant · sample data · nothing to install
                </p>
              </Link>
            </RevealOnView>
          </div>

          {/* 3 — Real books */}
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <RevealOnView>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Accounting that holds up
              </p>
              <h2 className="mt-3 text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.03em] text-foreground sm:text-4xl">
                Real books, not just payment tracking
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
                Every charge, payment, and payout posts to a true double-entry general ledger — the
                kind your accountant expects. No exporting a payments list into a spreadsheet and
                calling it bookkeeping.
              </p>
              <ul className="mt-6 space-y-3 text-sm leading-relaxed text-muted">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>
                    <strong className="font-semibold text-foreground">Trial balance &amp; balance sheet</strong>{" "}
                    — generated from the ledger, always in balance.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>
                    <strong className="font-semibold text-foreground">Owner statements</strong> — per
                    property, ready to send.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>
                    <strong className="font-semibold text-foreground">Security-deposit trust tracking</strong>{" "}
                    — deposits book as a liability, not income, and stay reconciled.
                  </span>
                </li>
              </ul>
            </RevealOnView>

            <RevealOnView delayMs={80}>
              <div className="glass-card rounded-2xl p-6 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">Trial balance</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                    Balanced
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-[1fr_auto_auto] gap-x-5 gap-y-2.5 text-sm tabular-nums">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Account
                  </span>
                  <span className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Debit
                  </span>
                  <span className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Credit
                  </span>

                  <span className="text-muted">Operating cash</span>
                  <span className="text-right text-foreground">3,450</span>
                  <span className="text-right text-muted">—</span>

                  <span className="text-muted">Accounts receivable</span>
                  <span className="text-right text-foreground">350</span>
                  <span className="text-right text-muted">—</span>

                  <span className="text-muted">Security deposit trust</span>
                  <span className="text-right text-foreground">1,200</span>
                  <span className="text-right text-muted">—</span>

                  <span className="text-muted">Rental income</span>
                  <span className="text-right text-muted">—</span>
                  <span className="text-right text-foreground">3,800</span>

                  <span className="text-muted">Deposit liability</span>
                  <span className="text-right text-muted">—</span>
                  <span className="text-right text-foreground">1,200</span>

                  <span className="col-span-3 my-1 border-t border-border/60" aria-hidden />

                  <span className="font-semibold text-foreground">Totals</span>
                  <span className="text-right font-semibold text-foreground">5,000</span>
                  <span className="text-right font-semibold text-foreground">5,000</span>
                </div>
                <p className="mt-4 text-[11px] font-medium text-muted">
                  Trial balance · balance sheet · general ledger · owner statements
                </p>
              </div>
            </RevealOnView>
          </div>
        </div>
      </section>

      {/* ----------------------- Old way vs PropLane ----------------------- */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <RevealOnView>
            <h2 className="mx-auto max-w-2xl text-center text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[2.5rem]">
              The old way vs PropLane
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-muted sm:text-base">
              The same week of property management, run two ways.
            </p>
          </RevealOnView>

          <div className="mt-10 grid gap-4 sm:mt-12 lg:grid-cols-2">
            <RevealOnView className="h-full">
              <div className="glass-card h-full rounded-2xl p-7">
                <h3 className="text-lg font-semibold text-muted">The old way</h3>
                <ul className="mt-5 space-y-4 text-sm leading-relaxed text-muted">
                  {OLD_WAY.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-bold text-muted"
                        aria-hidden
                      >
                        ✕
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </RevealOnView>

            <RevealOnView delayMs={60} className="h-full">
              <div className="glass-card h-full rounded-2xl border-primary/25 p-7">
                <h3 className="text-lg font-semibold text-foreground">With PropLane</h3>
                <ul className="mt-5 space-y-4 text-sm leading-relaxed text-muted">
                  {PROPLANE_WAY.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary"
                        aria-hidden
                      >
                        ✓
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </RevealOnView>
          </div>
        </div>
      </section>

      {/* --------------------------- Pricing strip --------------------------- */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <RevealOnView>
            <h2 className="mx-auto max-w-2xl text-center text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[2.5rem]">
              Honest pricing
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-muted sm:text-base">
              Three plans, real numbers, no &ldquo;contact sales&rdquo; wall.
            </p>
          </RevealOnView>

          <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:mt-12 sm:grid-cols-3">
            {PRICING_TIERS.map((tier, i) => (
              <RevealOnView key={tier.name} delayMs={i * 60} className="h-full">
                <div className="glass-card flex h-full flex-col rounded-2xl p-7 text-center">
                  <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-primary">
                    {tier.name}
                  </h3>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                    {tier.price}
                    <span className="text-sm font-medium text-muted"> {tier.cadence}</span>
                  </p>
                  <p className="mt-4 text-sm font-medium text-foreground">{tier.listings}</p>
                  <p className="mt-1 text-sm text-muted">{tier.fee}</p>
                </div>
              </RevealOnView>
            ))}
          </div>

          <RevealOnView delayMs={180}>
            <p className="mx-auto mt-8 max-w-xl text-center text-sm text-muted">
              Every paid plan starts with a 14-day free trial — no card required. Save 20% with
              annual billing.
            </p>
            <div className="mt-4 flex justify-center">
              <Link
                href="/partner/pricing"
                data-attr="why-proplane-pricing-link"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors duration-200 hover:gap-2"
              >
                See full pricing details
                <span aria-hidden>→</span>
              </Link>
            </div>
          </RevealOnView>
        </div>
      </section>

      {/* ----------------------------- CTA band ----------------------------- */}
      <section className="hero-chrome-scene relative overflow-hidden py-16 sm:py-24">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-5">
          <RevealOnView>
            <h2 className="hero-title mx-auto max-w-2xl text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.5rem]">
              See the work before it happens
            </h2>
            <p className="hero-subtitle mx-auto mt-4 max-w-xl text-sm leading-relaxed sm:text-base">
              Set up your first listing in minutes. PropLane is in beta, built in Seattle — and the
              AI never acts without your approval.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/auth/create-account?mode=create&role=manager"
                data-attr="why-proplane-cta-get-started"
                className="btn-metallic hero-cta-metallic inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-px active:scale-[0.99] sm:w-auto"
              >
                Get started for free
              </Link>
              <Link
                href="/contact"
                data-attr="why-proplane-cta-book-demo"
                className="hero-cta-outline inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full border px-8 py-3 text-sm font-semibold transition-colors duration-200 active:scale-[0.99] sm:w-auto"
              >
                Book a demo
              </Link>
            </div>
          </RevealOnView>
        </div>
      </section>
    </div>
  );
}
