import type { Metadata } from "next";
import Link from "next/link";
import {
  MANAGER_PLAN_TIERS,
  type ManagerPlanTierDefinition,
} from "@/data/manager-plan-tiers";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "PropLane pricing — start free, then Pro at $20/mo or Business at $200/mo. 14-day trial, no card required, and a live demo with no signup.",
};

const CTA_BASE = "/auth/create-account?mode=create&role=manager";

/** Per-tier CTA copy + tier param (mirrors the existing create-account tier pattern). */
const TIER_CTA: Record<
  ManagerPlanTierDefinition["id"],
  { href: string; label: string; solid: boolean }
> = {
  free: { href: `${CTA_BASE}&tier=free`, label: "Get started free", solid: false },
  pro: { href: `${CTA_BASE}&tier=pro`, label: "Start 14-day trial", solid: true },
  business: { href: `${CTA_BASE}&tier=business`, label: "Start 14-day trial", solid: false },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is the free tier actually free?",
    a: "Yes — Free is $0 with no card. You get one property listing, applications and tour scheduling, and payment collection. Residents, leases, work orders, inbox, and co-managers live on Pro and up.",
  },
  {
    q: "Do I need a credit card to try Pro or Business?",
    a: "No. The 14-day trial needs no card. You only add payment details if you decide to keep a paid plan after the trial.",
  },
  {
    q: "How does annual billing save about 20%?",
    a: "Paying for the year up front is roughly two months free — Pro is $192/yr instead of $240, and Business is $1,920/yr instead of $2,400.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Upgrade or downgrade anytime. Upgrading unlocks residents, leases, the inbox, and more co-managers right away; the payment fee drops as you move up.",
  },
];

function pillClass(active: boolean): string {
  return active
    ? "relative inline-flex items-center gap-2 rounded-full bg-[var(--secondary)] px-4 py-1.5 text-[13px] font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
    : "relative inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground";
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[15px] w-[15px] shrink-0 text-primary"
      aria-hidden
    >
      <path d="M4 10.5l3.5 3.5L16 5.5" />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="h-[15px] w-[15px] shrink-0 text-muted/60"
      aria-hidden
    >
      <path d="M5 10h10" />
    </svg>
  );
}

function PlanCard({
  tier,
  annual,
}: {
  tier: ManagerPlanTierDefinition;
  annual: boolean;
}) {
  const featured = tier.id === "pro";
  const price = annual ? tier.annual : tier.monthly;
  const cta = TIER_CTA[tier.id];

  return (
    <div
      className={
        "relative flex flex-col rounded-xl border p-6 " +
        (featured
          ? "border-primary/40 bg-primary/5 shadow-[var(--shadow-card)]"
          : "border-border bg-card")
      }
    >
      {featured ? (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-[var(--secondary)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.07em] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_color-mix(in_srgb,var(--primary)_45%,transparent)]" />
          Popular
        </span>
      ) : null}

      <div className="text-[13px] font-medium uppercase tracking-[0.07em] text-muted">
        {tier.label}
      </div>

      <div className="mt-4 flex items-end gap-1.5">
        <span className="text-[2.6rem] font-semibold leading-none tracking-[-0.03em] text-foreground">
          {price.headline}
        </span>
        {price.period ? (
          <span className="pb-1 text-[14px] text-muted">{price.period}</span>
        ) : null}
      </div>
      <div className="mt-1.5 h-4 text-[12px] text-muted/60">
        {price.period ? (annual ? "billed annually" : "billed monthly") : "no card required"}
      </div>

      <p className="mt-4 min-h-[60px] text-[13.5px] leading-relaxed text-muted">
        {price.sub}
      </p>

      <Link
        href={cta.href}
        data-attr={`pricing-plan-${tier.id}-cta`}
        className={
          "mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[7px] px-5 text-[14px] font-medium transition active:scale-[0.99] " +
          (cta.solid
            ? "border border-border bg-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] hover:brightness-110"
            : "border border-border bg-transparent text-foreground hover:border-foreground/20 hover:bg-[var(--secondary)]")
        }
      >
        {cta.label}
      </Link>

      <div className="mt-6 h-px w-full bg-[var(--border)]" />

      <ul className="mt-5 flex flex-col gap-3">
        {tier.features.map((feature) => (
          <li key={feature.text} className="flex items-start gap-2.5">
            {feature.included ? <CheckIcon /> : <DashIcon />}
            <span
              className={
                "text-[13.5px] leading-snug " +
                (feature.included ? "text-foreground" : "text-muted/60")
              }
            >
              {feature.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const annual = params.billing === "annual";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Subtle indigo glow behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] max-w-[130%] -translate-x-1/2 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--primary) 12%, transparent), color-mix(in srgb, var(--primary) 5%, transparent) 42%, transparent 70%)",
          filter: "blur(44px)",
        }}
      />

      {/* Hero + toggle */}
      <section className="relative mx-auto max-w-6xl px-5 pt-20 text-center sm:px-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-[var(--secondary)] px-3 py-1 text-[12px] font-medium tracking-[0.06em] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_color-mix(in_srgb,var(--primary)_45%,transparent)]" />
          PROPLANE · PRICING
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[3.4rem]">
          Simple pricing.
          <br />
          <span className="text-muted/60">Free to start.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[15.5px] leading-relaxed text-muted">
          One platform for managers, residents, and vendors — applications and leases, rent
          collection, work orders, and real double-entry books. Start free, upgrade when it
          earns its keep.
        </p>
        <p className="mt-5 text-[12.5px] text-muted/60">
          14-day trial · no card required · live demo with no signup
        </p>

        <div className="mt-9 inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
          <Link
            href="/pricing"
            scroll={false}
            data-attr="pricing-billing-monthly"
            className={pillClass(!annual)}
          >
            Monthly
          </Link>
          <Link
            href="/pricing?billing=annual"
            scroll={false}
            data-attr="pricing-billing-annual"
            className={pillClass(annual)}
          >
            Annual
            <span className="rounded-full bg-[var(--status-confirmed-fg)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--status-confirmed-fg)]">
              Save 20%
            </span>
          </Link>
        </div>
      </section>

      {/* Plan cards */}
      <section className="relative mx-auto mt-12 max-w-6xl px-5 sm:px-6">
        <div className="grid gap-5 md:grid-cols-3">
          {MANAGER_PLAN_TIERS.map((tier) => (
            <PlanCard key={tier.id} tier={tier} annual={annual} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="relative mx-auto mt-16 max-w-3xl px-5 sm:px-6">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
          Questions, answered
        </h2>
        <div className="mt-6 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-border bg-card">
          {FAQ.map((item) => (
            <div key={item.q} className="px-6 py-5">
              <div className="text-[15px] font-medium tracking-[-0.01em] text-foreground">
                {item.q}
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative mx-auto mt-16 max-w-4xl px-5 pb-24 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-12 text-center sm:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-[300px] w-[600px] -translate-x-1/2 opacity-70"
            style={{
              background:
                "radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 68%)",
              filter: "blur(42px)",
            }}
          />
          <h2 className="relative text-[26px] font-semibold tracking-[-0.025em] sm:text-[30px]">
            Try it before you pay.
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-[14.5px] leading-relaxed text-muted">
            Start on the free tier, or click through the live product with sample data — no
            signup, no card.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`${CTA_BASE}&tier=free`}
              data-attr="pricing-final-get-started"
              className="inline-flex min-h-[46px] items-center justify-center rounded-[7px] border border-border bg-primary px-6 text-[14.5px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition hover:brightness-110 active:scale-[0.99]"
            >
              Get started free
            </Link>
            <Link
              href="/demo"
              data-attr="pricing-final-demo"
              className="inline-flex min-h-[46px] items-center justify-center rounded-[7px] border border-border bg-transparent px-6 text-[14.5px] font-medium text-foreground transition hover:border-foreground/20 hover:bg-[var(--secondary)]"
            >
              Launch the live demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
