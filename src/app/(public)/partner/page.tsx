import Link from "next/link";
import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { RevealOnView } from "@/components/motion/reveal-on-view";

const STATS = [
  { value: "3", label: "Properties managed" },
  { value: "10", label: "Residents" },
] as const;

export default function PartnerLandingPage() {
  return (
    <div className="bg-background">

      {/* ── Hero ── */}
      <section className="hero-chrome-scene relative overflow-hidden pb-10 pt-14 sm:pb-12 sm:pt-20 md:pt-24">
        <ChromeSubstrate variant="full" />
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
          <div className="hero-eyebrow animate-fade-up mb-5 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md sm:mb-6 sm:px-4">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--steel-light)] shadow-[0_0_10px_rgba(188,212,255,0.9)]" />
            <span className="text-xs font-semibold tracking-wide sm:text-[13px]">Axis Housing · Partner program</span>
          </div>
          <h1 className="hero-title animate-fade-up text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[3.25rem] md:text-[3.75rem]" style={{ animationDelay: "60ms" }}>
            We manage your property so <span className="text-gradient-accent">you don&apos;t have to</span>
          </h1>
          <p className="hero-subtitle animate-fade-up mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ animationDelay: "90ms" }}>
            Full-service management or self-serve software — we help owners maximize revenue while minimizing effort.
          </p>
          <div className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4" style={{ animationDelay: "120ms" }}>
            <Link href="/contact?tab=schedule" className="btn-cobalt inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold transition-[transform,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98] sm:w-auto">Book a consultation</Link>
            <Link href="/partner/pricing" className="btn-metallic inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold text-foreground transition-[transform,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.99] sm:w-auto">Use our software</Link>
          </div>
          <div className="animate-fade-up mx-auto mt-12 grid max-w-md grid-cols-2 gap-4 sm:mt-10 sm:gap-6" style={{ animationDelay: "150ms" }}>
            {STATS.map((stat) => (
              <div key={stat.label} className="glass-card rounded-2xl px-3 py-4 sm:px-4">
                <p className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{stat.value}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted sm:text-[11px]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What we handle ── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10">
        <RevealOnView>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">What we handle</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">Full-service, start to finish</h2>
          </div>
        </RevealOnView>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <RevealOnView key={f.title} delayMs={i * 60}>
              <div className="glass-card group h-full rounded-2xl p-7 transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-[var(--shadow-card-hover)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
                {f.icon}
              </div>
              <h3 className="mt-5 text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            </RevealOnView>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-y border-border/60 bg-accent/15 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <RevealOnView>
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">How it works</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">Simple for you. Thorough for us.</h2>
            </div>
          </RevealOnView>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {HOW_STEPS.map((s, i) => (
              <RevealOnView key={s.title} delayMs={i * 80}>
                <li className="glass-card rounded-2xl p-7">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
                </li>
              </RevealOnView>
            ))}
          </ol>
        </div>
      </section>

      {/* ── CTA ── */}
      <section
        id="consultation"
        className="py-16 sm:py-20"
        style={{ background: "linear-gradient(135deg, var(--cobalt-deep) 0%, var(--primary) 45%, var(--sky) 100%)" }}
      >
        <RevealOnView>
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">Interested in working with us?</h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/85">Schedule a consultation to discuss full-service management and how we can help.</p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link href="/contact?tab=schedule" className="btn-metallic inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold text-foreground transition-[transform,filter] duration-200 active:scale-[0.99] sm:w-auto">Book consultation</Link>
            </div>
            <p className="mt-6 text-sm text-white/70">No commitment required · Typically respond within 1 business day</p>
          </div>
        </RevealOnView>
      </section>

    </div>
  );
}

const FEATURES = [
  {
    title: "Tenant sourcing & screening",
    body: "We find, vet, and place high-quality tenants — background checks, income verification, and reference calls included.",
    icon: <PeopleIcon />,
  },
  {
    title: "Lease & contract management",
    body: "Leases drafted, signed, renewed, and stored. We track every critical date so nothing slips.",
    icon: <DocIcon />,
  },
  {
    title: "Furnishing & pricing optimization",
    body: "We advise on furnishing and pricing to maximize your monthly rate in your local market.",
    icon: <HomeIcon />,
  },
  {
    title: "Maintenance coordination",
    body: "Residents submit work orders directly to us. We triage, dispatch, and resolve — you're informed, never overwhelmed.",
    icon: <WrenchIcon />,
  },
  {
    title: "Rent collection & reporting",
    body: "Monthly statements delivered to you. Payments handled end-to-end.",
    icon: <ChartIcon />,
  },
  {
    title: "Resident support",
    body: "Residents have a direct line to our team. Issues get handled fast, keeping satisfaction high.",
    icon: <SupportIcon />,
  },
];

const HOW_STEPS = [
  {
    title: "Initial consultation",
    body: "We learn about your property and goals. No paperwork yet — just a conversation.",
  },
  {
    title: "Onboarding & setup",
    body: "We photograph the unit, draft your listing, set pricing, and launch within 1–2 weeks.",
  },
  {
    title: "Ongoing management",
    body: "We handle day-to-day operations. You receive monthly reports and can reach us anytime.",
  },
];

function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function WrenchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}
function SupportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
