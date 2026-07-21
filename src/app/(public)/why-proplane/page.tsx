import type { Metadata } from "next";
import Link from "next/link";
import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { RevealOnView } from "@/components/motion/reveal-on-view";
import { RESIDENT_BROWSE_PATH } from "@/lib/resident-public-nav";

export const metadata: Metadata = {
  title: "Why PropLane",
  description:
    "AI drafts leases, tours, messages, and rent work — you approve every write. One platform for managers, residents, and vendors with real double-entry books.",
};

const PILLARS = [
  {
    eyebrow: "Approval-first AI",
    title: "AI drafts. You approve.",
    body: "Chatbot and leasing SMS prepare the work. Leases, reminders, and vendor outreach never send without your OK.",
    points: [
      ["Leases from applications", "Terms filled from the applicant — e-sign when you release."],
      ["Automatic messages", "Rent, lease-ready, and visit updates draft first; you send."],
      ["Scheduled tours", "Prospects book from listings or text — slots land on your calendar."],
    ],
  },
  {
    eyebrow: "Three portals",
    title: "Managers, residents, vendors.",
    body: "Same product, scoped correctly. Everyone works in PropLane — not parallel inboxes.",
    points: [
      ["Managers", "Leasing, rent, services, inbox, finances, and AI approvals."],
      ["Residents", "Browse, apply, pay rent (ACH free), and message your manager."],
      ["Vendors", "Jobs, bids, visits, and payouts in one place."],
    ],
  },
  {
    eyebrow: "Real books",
    title: "Ledger, not a spreadsheet.",
    body: "Charges and payments write through to double-entry books your accountant can trust.",
    points: [
      ["Trial balance & GL", "Always balanced from the same source of truth."],
      ["Owner statements", "Per property, ready to send."],
      ["Deposit trust", "Security deposits book as liability — not income."],
    ],
  },
] as const;

const OLD_WAY = [
  "Retype applications into lease templates and chase signatures by email.",
  "Text tenants about rent and track paid/unpaid in a spreadsheet.",
  "Phone-tag contractors for one quote on one repair.",
  "Reconcile receipts every spring for something tax-ready.",
] as const;

const PROPLANE_WAY = [
  "AI drafts the lease from the application — you review, both sides e-sign.",
  "Rent collects on-platform via Stripe; reminders draft, you approve send.",
  "Work orders invite bids; approved work pays out through Connect.",
  "Double-entry posts itself — trial balance, trust, owner statements.",
] as const;

const PRICING_TIERS = [
  { name: "Free", price: "$0", cadence: "forever", detail: "1 listing · 0.5% payment fee" },
  { name: "Pro", price: "$20", cadence: "/mo", detail: "2 listings · 0.25% payment fee" },
  { name: "Business", price: "$200", cadence: "/mo", detail: "20 listings · 0% payment fee" },
] as const;

export default function WhyPropLanePage() {
  return (
    <div>
      <section className="hero-chrome-scene relative overflow-hidden pb-14 pt-14 sm:pb-16 sm:pt-20">
        <ChromeSubstrate variant="full" />
        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-5">
          <RevealOnView>
            <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-primary">Why PropLane</p>
            <h1 className="hero-title mx-auto mt-4 max-w-[16ch] text-[2.4rem] font-semibold leading-[1.06] tracking-[-0.035em] sm:text-[3.4rem] md:text-[3.75rem]">
              Property ops that wait for your OK
            </h1>
            <p className="hero-subtitle mx-auto mt-5 max-w-[42ch] text-base leading-relaxed sm:text-lg">
              Tours. Texts. Rent. Approvals. One platform — AI drafts, you confirm.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/create-account?mode=create&role=manager"
                data-attr="why-proplane-hero-get-started"
                className="btn-metallic hero-cta-metallic inline-flex min-h-[46px] w-full items-center justify-center rounded-full px-8 text-sm font-semibold sm:w-auto"
              >
                Get started free
              </Link>
              <Link
                href="/pricing"
                data-attr="why-proplane-hero-pricing"
                className="hero-cta-outline inline-flex min-h-[46px] w-full items-center justify-center rounded-full border px-8 text-sm font-semibold sm:w-auto"
              >
                See pricing
              </Link>
            </div>
          </RevealOnView>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-border py-16 sm:py-20">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl space-y-20 px-4 sm:px-5 lg:space-y-24">
          {PILLARS.map((pillar, i) => (
            <div
              key={pillar.title}
              className={`grid items-start gap-10 lg:grid-cols-2 lg:gap-16 ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}
            >
              <RevealOnView>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{pillar.eyebrow}</p>
                <h2 className="mt-3 max-w-[14ch] text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.03em] text-foreground sm:text-[2.25rem]">
                  {pillar.title}
                </h2>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">{pillar.body}</p>
              </RevealOnView>
              <RevealOnView delayMs={60}>
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
                  {pillar.points.map(([label, copy], idx) => (
                    <div
                      key={label}
                      className={`px-5 py-4 ${idx > 0 ? "border-t border-border" : ""}`}
                    >
                      <div className="text-[14px] font-semibold text-foreground">{label}</div>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{copy}</p>
                    </div>
                  ))}
                </div>
              </RevealOnView>
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-border py-16 sm:py-20">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <RevealOnView>
            <h2 className="mx-auto max-w-xl text-center text-[2rem] font-semibold tracking-[-0.03em] text-foreground sm:text-[2.4rem]">
              Old way vs PropLane
            </h2>
          </RevealOnView>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <RevealOnView>
              <div className="h-full rounded-2xl border border-border bg-card p-7">
                <h3 className="text-[15px] font-semibold text-muted">Old way</h3>
                <ul className="mt-5 space-y-4 text-[14px] leading-relaxed text-muted">
                  {OLD_WAY.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-0.5 text-muted/50" aria-hidden>
                        ✕
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </RevealOnView>
            <RevealOnView delayMs={50}>
              <div className="h-full rounded-2xl border border-primary/25 bg-card p-7 shadow-[var(--shadow-card)]">
                <h3 className="text-[15px] font-semibold text-foreground">PropLane</h3>
                <ul className="mt-5 space-y-4 text-[14px] leading-relaxed text-muted">
                  {PROPLANE_WAY.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-0.5 font-semibold text-primary" aria-hidden>
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

      <section className="relative overflow-hidden border-t border-border py-16 sm:py-20">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <RevealOnView>
            <h2 className="text-center text-[2rem] font-semibold tracking-[-0.03em] sm:text-[2.4rem]">Start where you fit</h2>
          </RevealOnView>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { href: "/partner", title: "Managers", body: "Run the portfolio with AI approvals.", cta: "For managers", attr: "why-role-managers" },
              { href: RESIDENT_BROWSE_PATH, title: "Residents", body: "Browse, apply, pay, and message.", cta: "For residents", attr: "why-role-residents" },
              { href: "/vendors", title: "Vendors", body: "Jobs, bids, and payouts.", cta: "For vendors", attr: "why-role-vendors" },
            ].map((card, i) => (
              <RevealOnView key={card.href} delayMs={i * 40}>
                <Link
                  href={card.href}
                  data-attr={card.attr}
                  className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition hover:border-primary/30 hover:shadow-[var(--shadow-card-hover)]"
                >
                  <h3 className="text-[15px] font-semibold text-foreground">{card.title}</h3>
                  <p className="mt-2 flex-1 text-[13.5px] text-muted">{card.body}</p>
                  <span className="mt-5 text-[13px] font-semibold text-primary">{card.cta} →</span>
                </Link>
              </RevealOnView>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-border py-16 sm:py-20">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <RevealOnView>
            <h2 className="text-center text-[2rem] font-semibold tracking-[-0.03em] sm:text-[2.4rem]">Honest pricing</h2>
            <p className="mx-auto mt-3 max-w-md text-center text-[14.5px] text-muted">Three plans. No sales wall.</p>
          </RevealOnView>
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
            {PRICING_TIERS.map((tier, i) => (
              <RevealOnView key={tier.name} delayMs={i * 40}>
                <div className="rounded-2xl border border-border bg-card p-6 text-center">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{tier.name}</div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight">
                    {tier.price}
                    <span className="text-sm font-medium text-muted"> {tier.cadence}</span>
                  </div>
                  <p className="mt-3 text-[13px] text-muted">{tier.detail}</p>
                </div>
              </RevealOnView>
            ))}
          </div>
          <RevealOnView delayMs={120}>
            <div className="mt-8 text-center">
              <Link href="/pricing" data-attr="why-proplane-pricing-link" className="text-sm font-semibold text-primary">
                Full pricing →
              </Link>
            </div>
          </RevealOnView>
        </div>
      </section>

      <section className="hero-chrome-scene relative overflow-hidden border-t border-border py-16 sm:py-20">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-5">
          <RevealOnView>
            <h2 className="hero-title text-[2rem] font-semibold tracking-[-0.03em] sm:text-[2.4rem]">Start free</h2>
            <p className="hero-subtitle mx-auto mt-3 max-w-md text-[14.5px]">14-day Pro trial. No card required.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/create-account?mode=create&role=manager"
                data-attr="why-proplane-cta-get-started"
                className="btn-metallic hero-cta-metallic inline-flex min-h-[46px] w-full items-center justify-center rounded-full px-8 text-sm font-semibold sm:w-auto"
              >
                Get started
              </Link>
              <Link
                href="/contact"
                data-attr="why-proplane-cta-contact"
                className="hero-cta-outline inline-flex min-h-[46px] w-full items-center justify-center rounded-full border px-8 text-sm font-semibold sm:w-auto"
              >
                Talk to us
              </Link>
            </div>
          </RevealOnView>
        </div>
      </section>
    </div>
  );
}
