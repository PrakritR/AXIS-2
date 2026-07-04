import Link from "next/link";
import { RevealOnView } from "@/components/motion/reveal-on-view";

const OWNER_FEATURES = [
  "Property records & unit setup",
  "Apply & tour links you share",
  "Lease workflows",
  "Rent collection",
] as const;

const VENDOR_FEATURES = [
  "See work orders offered to you, with the scheduled visit time",
  "Track your jobs on a calendar built for your schedule",
  "Message the property manager directly from your inbox",
  "Keep your W-9/tax info on file for accurate 1099s",
] as const;

const HOW_STEPS = [
  {
    title: "Onboard your properties",
    body: "Add units, fees, and availability in the manager portal.",
  },
  {
    title: "Share apply & tour links",
    body: "Prospects find you on Zillow or Redfin — Axis handles applications and tour scheduling.",
  },
  {
    title: "Lease & collect",
    body: "Sign leases digitally, collect rent, and coordinate maintenance from one place.",
  },
] as const;

export function LandingAudienceBento() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-5 sm:py-20">
      <RevealOnView>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Built for property owners</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            One platform for your portfolio
          </h2>
        </div>
      </RevealOnView>

      <RevealOnView delayMs={80}>
        <div className="mx-auto mt-12 max-w-2xl">
          <Link
            href="/partner"
            className="glass-card group flex h-full cursor-pointer flex-col rounded-2xl p-7 transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-[var(--shadow-card-hover)]"
          >
            <h3 className="text-lg font-semibold text-foreground">Property management software</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Run your portfolio in Axis — applications, screening, leases, and rent — or partner with us for full-service management.
            </p>
            <ul className="mt-5 space-y-2">
              {OWNER_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-foreground/80">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors duration-200 group-hover:gap-2">
              Partner with Axis
              <ArrowIcon />
            </span>
          </Link>
        </div>
      </RevealOnView>
    </section>
  );
}

export function LandingVendorCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-5 sm:py-20">
      <RevealOnView>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Built for maintenance vendors</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Become an Axis vendor
          </h2>
        </div>
      </RevealOnView>

      <RevealOnView delayMs={80}>
        <div className="mx-auto mt-12 max-w-2xl">
          <Link
            href="/auth/vendor-register"
            data-attr="become-a-vendor-cta"
            className="glass-card group flex h-full cursor-pointer flex-col rounded-2xl p-7 transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-[var(--shadow-card-hover)]"
          >
            <h3 className="text-lg font-semibold text-foreground">Work orders from Axis property managers</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Get started in minutes: create your account (or accept an invite from a manager you already
              work with), add your business & tax info, and start receiving offered work.
            </p>
            <ul className="mt-5 space-y-2">
              {VENDOR_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-foreground/80">
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors duration-200 group-hover:gap-2">
              Sign up as a vendor
              <ArrowIcon />
            </span>
          </Link>
        </div>
      </RevealOnView>
    </section>
  );
}

export function LandingHowItWorks() {
  return (
    <section className="border-y border-border/60 bg-accent/15 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <RevealOnView>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">How it works</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
              From listing to signed lease
            </h2>
          </div>
        </RevealOnView>

        <ol className="mt-12 grid gap-6 md:grid-cols-3 md:items-stretch">
          {HOW_STEPS.map((step, i) => (
            <RevealOnView key={step.title} delayMs={i * 80} className="h-full">
              <li className="glass-card flex h-full flex-col rounded-2xl p-7">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-base font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            </RevealOnView>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function LandingFinalCta() {
  return (
    <section
      className="py-16 sm:py-20"
      style={{ background: "linear-gradient(135deg, var(--cobalt-deep) 0%, var(--primary) 45%, var(--sky) 100%)" }}
    >
      <RevealOnView>
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-5">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
            Ready to get started?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/85">
            Run applications, leases, and rent collection on Axis — or let us manage your properties end to end.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/partner"
              className="btn-metallic inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold text-foreground transition-[transform,filter] duration-200 active:scale-[0.99] sm:w-auto"
            >
              Partner with Axis
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-white/30 px-8 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10 sm:w-auto"
            >
              Contact us
            </Link>
          </div>
        </div>
      </RevealOnView>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
