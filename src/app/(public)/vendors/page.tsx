import type { Metadata } from "next";
import Link from "next/link";
import { VendorSignupForm } from "@/components/auth/vendor-signup-form";

export const metadata: Metadata = {
  title: "Vendors · Axis",
  description:
    "Get discovered by property managers, receive work orders, bid after a tour, and get paid — free to join as an Axis vendor.",
};

const KEY_FACTS = [
  { value: "$450*", label: "Avg. monthly earnings per active vendor" },
  { value: "Free", label: "No subscription, no listing fee" },
  { value: "1099", label: "Tax info stays on file for accurate filing" },
] as const;

const HOW_IT_WORKS = [
  "Get matched to properties near you",
  "Tour the job and submit a bid",
  "Get paid directly through Axis",
] as const;

export default function VendorsPage() {
  return (
    <div className="min-h-screen px-4 py-12 sm:px-5 sm:py-16">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
          Work orders, sent straight to you.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Axis connects property managers with vendors like you. Free to join.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-2">
          {KEY_FACTS.map((f) => (
            <div key={f.label} className="glass-card rounded-2xl px-2 py-3">
              <p className="text-lg font-black tracking-tight text-foreground sm:text-xl">{f.value}</p>
              <p className="mt-1 text-[10px] font-medium leading-tight text-muted">{f.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted/60">*Illustrative figure — actual earnings vary by market and availability.</p>

        <ul className="mt-6 space-y-2 text-left">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step} className="flex items-center gap-2.5 text-sm text-foreground">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto mt-8 max-w-md">
        <div className="glass-card rounded-3xl p-7">
          <h2 className="text-lg font-semibold text-foreground">Sign up as a vendor</h2>
          <p className="mt-1 text-sm text-muted">Create your account to start getting matched with work.</p>
          <div className="mt-5">
            <VendorSignupForm />
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link
            href="/auth/sign-in"
            className="font-semibold text-primary hover:underline"
            data-attr="vendors-sign-in-link"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
