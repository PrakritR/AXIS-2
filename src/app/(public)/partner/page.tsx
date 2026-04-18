import Link from "next/link";

export default function PartnerLandingPage() {
  return (
    <div className="bg-white">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#eef6ff] via-[#f5f9ff] to-white pb-24 pt-20 sm:pt-28">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h1 className="text-[2.6rem] font-bold leading-[1.1] tracking-tight text-[#0d1f4e] sm:text-5xl md:text-[3.25rem]">
            We manage your property<br className="hidden sm:block" /> so you don&apos;t have to.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-500">
            We currently manage <strong className="font-semibold text-slate-700">3 properties</strong> and help owners maximize revenue while minimizing effort — from tenant sourcing to monthly reporting.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/partner/contact?tab=schedule"
              className="inline-flex items-center justify-center rounded-2xl px-8 py-3.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(0,122,255,0.34)] transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_36px_-8px_rgba(0,122,255,0.46)] hover:brightness-105 active:translate-y-px active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-alt))" }}
            >
              Book a consultation
            </Link>
            <Link
              href="/partner/pricing"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-8 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:translate-y-px active:scale-[0.99]"
            >
              Use our software
            </Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-24 h-[360px] w-[360px] rounded-full bg-[rgba(51,156,255,0.08)] blur-3xl" />
      </section>

      {/* ── What we handle ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">What we handle</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0d1f4e] sm:text-4xl">
            Full-service, start to finish
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-slate-200/80 bg-white p-7 shadow-sm transition-all duration-200 hover:border-primary/25 hover:shadow-[0_8px_32px_-4px_rgba(0,122,255,0.12)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
                {f.icon}
              </div>
              <h3 className="mt-5 text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">How it works</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0d1f4e] sm:text-4xl">
              Simple for you. Thorough for us.
            </h2>
          </div>
          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {HOW_STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl border border-slate-200/80 bg-white p-7 shadow-sm">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── CTA ── */}
      <section id="consultation" className="py-20 sm:py-24" style={{ background: "linear-gradient(135deg, #005fd1 0%, var(--primary) 45%, var(--primary-alt) 100%)" }}>
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Interested in working with us?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/85">
            Schedule a consultation to discuss full-service management and how we can help.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/partner/contact?tab=schedule"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-9 py-3.5 text-sm font-semibold text-primary shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all duration-200 hover:bg-slate-50 active:scale-[0.98]"
            >
              Book Consultation
            </Link>
          </div>
          <p className="mt-8 text-sm text-white/70">
            No commitment required · Typically respond within 1 business day
          </p>
        </div>
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
