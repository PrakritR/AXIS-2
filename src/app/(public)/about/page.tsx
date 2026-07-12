import type { Metadata } from "next";
import Link from "next/link";
import { ChromeSubstrate } from "@/components/brand/chrome-substrate";
import { RevealOnView } from "@/components/motion/reveal-on-view";

export const metadata: Metadata = {
  title: "About us",
  description:
    "PropLane is built by property managers in Seattle who run their own rental units on it every day — AI does the busywork, you approve what matters.",
};

const VALUES = [
  {
    title: "Software should do the work",
    body: "Chasing rent, drafting leases, filing documents, lining up vendors — that's busywork, and busywork is what software is for. Your time belongs on decisions, not data entry.",
  },
  {
    title: "You stay in control",
    body: "Every AI action is previewed before it happens, confirmed by you, and audit-logged after. Nothing goes out — no message, no lease, no charge — without your sign-off.",
  },
  {
    title: "One platform for everyone",
    body: "Managers, residents, and vendors each get a real portal, not a bolted-on login page. When everyone works in the same place, nothing falls through the cracks.",
  },
  {
    title: "Prove it before you pay",
    body: "A live demo with no signup, a free tier, and a 14-day trial with no card. If PropLane doesn't earn its keep on your portfolio, you shouldn't be paying for it.",
  },
] as const;

const FACTS = [
  "Built in Seattle",
  "Web + iOS, one account",
  "3 portals: manager, resident, vendor",
  "Run on our own units",
] as const;

export default function AboutPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="hero-chrome-scene relative overflow-hidden pb-16 pt-14 sm:pb-20 sm:pt-20 md:pt-24">
        <ChromeSubstrate variant="full" />
        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-5">
          <RevealOnView>
            <div className="hero-eyebrow mb-5 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md sm:mb-6 sm:px-4">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--steel-light)] shadow-[0_0_10px_rgba(188,212,255,0.9)]" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em] sm:text-[13px]">
                Who we are
              </span>
            </div>

            <h1 className="hero-title mx-auto max-w-4xl text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[3.5rem] md:text-[4rem]">
              Built by property managers who got tired of{" "}
              <span className="text-gradient-accent">the busywork</span>
            </h1>

            <p className="hero-subtitle mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg">
              We manage real rental units in Seattle. PropLane is the platform we built to run
              them — the AI does the busywork, and we approve what matters.
            </p>
          </RevealOnView>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Our story                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden py-14 sm:py-20">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
            <RevealOnView>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Our story
              </p>
              <h2 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[2.5rem]">
                We are our own first customer
              </h2>
            </RevealOnView>
            <RevealOnView delayMs={80}>
              <div className="space-y-5 text-base leading-relaxed text-muted sm:text-lg">
                <p>
                  We are property managers. The team behind PropLane manages real rental units in
                  Seattle, and for years we ran them the way most small landlords do: one tool for
                  listings, another for rent, and a spreadsheet for the books. Every month meant
                  copying the same numbers between systems and hoping nothing slipped.
                </p>
                <p>
                  So we built the platform we wished we had — one place where applications become
                  leases, rent collects itself, repairs get bid out and paid, and the books
                  balance to the penny. The AI does the busywork; the manager approves what
                  matters. Nothing happens without your sign-off.
                </p>
                <p className="text-foreground">
                  We run our own units on PropLane every single day. If a workflow annoys us, we
                  feel it before you do — and we fix it.
                </p>
              </div>
            </RevealOnView>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The team                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden py-14 sm:py-20">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <RevealOnView>
            <h2 className="mx-auto max-w-2xl text-center text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[2.5rem]">
              The team
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-base leading-relaxed text-muted">
              Property managers first, software builders second. Everyone shipping PropLane has
              dealt with a 2&nbsp;a.m. leak or a late rent check.
            </p>
          </RevealOnView>

          {/*
            ============================================================
            TODO: add real teammate cards (name, role, one-liner) as the
            team grows. Never invent named people here.
            ============================================================
          */}
          <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                initials: "PR",
                name: "Prakrit Ramachandran",
                role: "Founder",
                body: "Property manager in Seattle; PropLane started as the tool for his own units.",
              },
              {
                initials: "PL",
                name: "The PropLane crew",
                role: "Product & engineering",
                body: "Property managers, engineers, and AI tinkerers in Seattle building the platform we use ourselves.",
              },
              {
                initials: "RV",
                name: "Our residents & vendors",
                role: "Early-access community",
                body: "The beta testers who shape every release — every portal is built around their feedback.",
              },
            ].map((member, i) => (
              <RevealOnView key={member.name} delayMs={i * 60} className="h-full">
                <div className="glass-card flex h-full flex-col rounded-2xl p-7">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/[0.08] text-base font-semibold text-primary">
                    {member.initials}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-foreground">{member.name}</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                    {member.role}
                  </p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{member.body}</p>
                </div>
              </RevealOnView>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* What we believe                                                   */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden py-14 sm:py-20">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <RevealOnView>
            <h2 className="mx-auto max-w-2xl text-center text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[2.5rem]">
              What we believe
            </h2>
          </RevealOnView>

          <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2">
            {VALUES.map((value, i) => (
              <RevealOnView key={value.title} delayMs={i * 60} className="h-full">
                <div className="glass-card flex h-full flex-col rounded-2xl p-7">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-foreground">{value.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{value.body}</p>
                </div>
              </RevealOnView>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Fact strip                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden py-8 sm:py-10">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
          <RevealOnView>
            <ul className="glass-card flex flex-col items-center justify-center gap-3 rounded-2xl px-6 py-5 text-center sm:flex-row sm:flex-wrap sm:gap-x-8 sm:py-6">
              {FACTS.map((fact, i) => (
                <li
                  key={fact}
                  className="flex items-center gap-3 text-sm font-semibold text-foreground sm:gap-8"
                >
                  {i > 0 && (
                    <span aria-hidden className="hidden h-1 w-1 rounded-full bg-muted/60 sm:block" />
                  )}
                  {fact}
                </li>
              ))}
            </ul>
          </RevealOnView>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* CTA band                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="hero-chrome-scene relative overflow-hidden py-16 sm:py-24">
        <ChromeSubstrate variant="quiet" />
        <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-5">
          <RevealOnView>
            <h2 className="hero-title mx-auto max-w-2xl text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.75rem]">
              Run your units the way we run ours
            </h2>
            <p className="hero-subtitle mx-auto mt-4 max-w-xl text-base leading-relaxed sm:text-lg">
              Start free, no card required — or watch the AI work a real portfolio first.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/create-account?mode=create&role=manager"
                data-attr="about-cta-get-started"
                className="btn-metallic hero-cta-metallic inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full px-9 py-3.5 text-[15px] font-semibold transition-[transform,box-shadow,filter] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-px active:scale-[0.99] sm:w-auto"
              >
                Get started for free
              </Link>
              <Link
                href="/contact"
                data-attr="about-cta-book-demo"
                className="hero-cta-outline inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full border px-9 py-3.5 text-[15px] font-semibold transition-colors duration-200 active:scale-[0.99] sm:w-auto"
              >
                Book a demo
              </Link>
            </div>
          </RevealOnView>
        </div>
      </section>
    </>
  );
}
