import type { Metadata } from "next";
import Link from "next/link";
import { RevealOnView } from "@/components/motion/reveal-on-view";

export const metadata: Metadata = {
  title: "Vendors · Axis",
  description:
    "Get discovered by property managers, receive work orders, bid after a tour, and get paid — free to join as an Axis vendor.",
};

const VENDOR_FEATURES = [
  "Get discovered by property managers using Axis",
  "Receive work orders with a scheduled visit time",
  "Submit a bid or quote after touring the job",
  "Track every job on a calendar built for your schedule",
  "Message the property manager directly from your inbox",
  "Keep your W-9/tax info on file for accurate 1099s",
  "Get paid directly through Axis",
] as const;

const HOW_STEPS = [
  {
    title: "Create your account",
    body: "Sign up free, or accept an invite from a manager you already work with.",
  },
  {
    title: "Get offered work",
    body: "Property managers send you work orders with a scheduled visit time.",
  },
  {
    title: "Tour & submit a bid",
    body: "Walk the job, then submit your cost and proposed time right from your portal.",
  },
  {
    title: "Get paid",
    body: "Complete the job and get paid — your W-9 and tax info stay on file for accurate 1099s.",
  },
] as const;

export default function VendorsPage() {
  return (
    <div className="min-h-screen px-4 py-14 sm:px-5 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-[-0.03em] text-foreground sm:text-5xl md:text-[3.25rem]">
          Work orders, sent straight to you.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted">
          Axis connects property managers with vendors like you — get discovered, receive offered work, bid
          after a tour, and get paid. Free to join.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/auth/vendor-register"
            data-attr="vendors-hero-cta"
            className="btn-cobalt inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold transition-[transform,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98] sm:w-auto"
          >
            Sign up as a vendor
          </Link>
          <Link
            href="#how-it-works"
            className="btn-metallic inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold text-foreground transition-[transform,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.99] sm:w-auto"
          >
            See how it works
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-md">
        <div
          className="rounded-3xl p-[2px]"
          style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--sky) 50%, var(--steel-light) 100%)" }}
        >
          <div className="flex flex-col rounded-[calc(1.5rem-2px)] glass-card p-7">
            <span className="inline-flex w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              Vendor
            </span>

            <div className="mt-3 flex flex-wrap items-baseline gap-x-1 gap-y-0">
              <span className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">Free</span>
              <span className="text-sm font-medium text-muted">to join, forever</span>
            </div>

            <p className="mt-2 text-sm leading-snug text-muted">
              No subscription, no listing fee. You only get paid when you work.
            </p>

            <Link
              href="/auth/vendor-register"
              data-attr="vendors-choose-free"
              className="btn-cobalt mt-5 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl py-3 text-center text-sm font-semibold transition-all duration-150 active:scale-[0.98]"
            >
              Get started free
            </Link>

            <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5">
              {VENDOR_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 shrink-0 text-primary" aria-hidden>
                    <CheckIcon />
                  </span>
                  <span className="text-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <section id="how-it-works" className="mx-auto mt-16 max-w-5xl scroll-mt-24 sm:mt-20">
        <RevealOnView>
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">How it works</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
              From sign-up to paid job
            </h2>
          </div>
        </RevealOnView>

        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
      </section>

      <section
        className="mx-auto mt-16 max-w-3xl rounded-3xl px-4 py-16 text-center sm:mt-20 sm:px-8"
        style={{ background: "linear-gradient(135deg, var(--cobalt-deep) 0%, var(--primary) 45%, var(--sky) 100%)" }}
      >
        <RevealOnView>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
            Ready to start getting work?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/85">
            Create your account in minutes — or accept an invite from a manager you already work with.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auth/vendor-register"
              data-attr="vendors-final-cta"
              className="btn-metallic inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full px-8 py-3 text-sm font-semibold text-foreground transition-[transform,filter] duration-200 active:scale-[0.99] sm:w-auto"
            >
              Sign up as a vendor
            </Link>
            <Link
              href="/contact"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-white/30 px-8 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10 sm:w-auto"
            >
              Contact us
            </Link>
          </div>
          <p className="mt-6 text-sm text-white/70">
            Already have an account?{" "}
            <Link
              href="/auth/sign-in"
              className="font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
              data-attr="vendors-sign-in-link"
            >
              Sign in
            </Link>
          </p>
        </RevealOnView>
      </section>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
