import type { Metadata } from "next";
import Link from "next/link";
import { VendorSignupForm } from "@/components/auth/vendor-signup-form";

export const metadata: Metadata = {
  title: "Vendors · Axis",
  description:
    "Get discovered by property managers, receive work orders, bid after a tour, and get paid — free to join as an Axis vendor.",
};

const KEY_FACTS = [
  { value: "$450", label: "Avg. monthly earnings per active vendor" },
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
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.03em] text-foreground sm:whitespace-nowrap sm:text-4xl">
          Work orders, sent straight to you.
        </h1>

        <div className="mx-auto mt-8 max-w-md">
          <div className="grid grid-cols-3 gap-2">
            {KEY_FACTS.map((f) => (
              <div key={f.label} className="glass-card rounded-2xl px-2 py-3">
                <p className="text-lg font-black tracking-tight text-foreground sm:text-xl">{f.value}</p>
                <p className="mt-1 text-[10px] font-medium leading-tight text-muted">{f.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-start justify-center">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step} className="contents">
                {i > 0 ? (
                  <div
                    aria-hidden
                    className="mt-4 h-0 w-6 shrink-0 border-t-2 border-dashed border-primary/40 sm:mt-4 sm:w-10"
                  />
                ) : null}
                <div className="flex w-20 flex-col items-center gap-2 sm:w-24">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-center text-xs leading-tight text-foreground">{step}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-md">
        <div className="glass-card rounded-3xl p-7">
          <h2 className="text-center text-lg font-semibold text-foreground">Sign up as a vendor</h2>
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
