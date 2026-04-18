"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";
import { useState } from "react";
import Link from "next/link";

const tiers = [
  {
    id: "free",
    label: "Free Tier",
    monthly: "Free",
    annual: "Free",
    blurb: "House posting only.",
    cta: "Choose Free",
    features: [
      { text: "House posting only", included: true },
      { text: "No rent collection access", included: false },
      { text: "No announcements access", included: false },
      { text: "No work order system", included: false },
    ],
  },
  {
    id: "pro",
    label: "Pro Tier",
    monthly: "$20",
    annual: "$16",
    period: "/ month",
    blurb: "For 1-2 houses.",
    cta: "Choose Pro",
    highlight: true,
    features: [
      { text: "1-2 houses", included: true },
      { text: "Rent collection access", included: true },
      { text: "Announcements access", included: true },
      { text: "Work order system access", included: true },
    ],
  },
  {
    id: "business",
    label: "Business Tier",
    monthly: "$200",
    annual: "$160",
    period: "/ month",
    blurb: "For 10+ houses.",
    cta: "Choose Business",
    features: [
      { text: "10+ houses", included: true },
      { text: "Rent collection access", included: true },
      { text: "Announcements access", included: true },
      { text: "Work order system access", included: true },
    ],
  },
];

export default function PartnerPricingPage() {
  const { showToast } = useAppUi();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="min-h-screen px-4 py-16 sm:py-20">
      {/* Header */}
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-5xl font-black tracking-tight text-[#0d1f4e] sm:text-6xl">
          Start with Axis.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-500">
          Partner With Axis starts here: choose a tier, open partner signup below, and complete checkout or free-tier setup. Your plan, Manager ID, and contact details are created on this page before you create your manager portal account.
        </p>

        {/* Billing toggle */}
        <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-150 ${
              billing === "monthly"
                ? "bg-[#3b66f5] text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling("annual")}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-150 ${
              billing === "annual"
                ? "bg-[#3b66f5] text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Annual
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              billing === "annual" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
            }`}>
              20% off
            </span>
          </button>
        </div>
      </div>

      {/* Pricing cards */}
      <div className="mx-auto mt-10 grid max-w-5xl gap-5 lg:grid-cols-3">
        {tiers.map((t) => (
          <div
            key={t.id}
            className="flex flex-col rounded-3xl border border-slate-200/80 bg-white p-7 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.1)]"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t.label}</p>

            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-5xl font-black tracking-tight text-[#0d1f4e]">
                {billing === "monthly" ? t.monthly : t.annual}
              </span>
              {t.period && (
                <span className="text-sm font-medium text-slate-400">{t.period}</span>
              )}
            </div>

            <p className="mt-2 text-sm text-slate-400">{t.blurb}</p>

            <button
              type="button"
              onClick={() => showToast(`${t.cta} (demo)`)}
              className="mt-6 w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800 transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
            >
              {t.cta}
            </button>

            <div className="my-6 border-t border-slate-100" />

            <ul className="space-y-3">
              {t.features.map((f) => (
                <li key={f.text} className="flex items-center gap-3 text-sm">
                  <span className={f.included ? "text-[#3b66f5]" : "text-slate-300"} aria-hidden>
                    <CheckIcon />
                  </span>
                  <span className={f.included ? "text-slate-700" : "text-slate-400"}>{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="mx-auto mt-8 max-w-5xl rounded-3xl border border-slate-200/80 bg-white px-8 py-8 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.1)] text-center">
        <p className="text-sm leading-relaxed text-slate-500">
          Chosen a plan? Open the partner signup form to enter your details and continue to checkout or free-tier setup.
        </p>
        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => showToast("Partner signup: coming soon")}
            className="inline-flex items-center justify-center rounded-full bg-[#3b66f5] px-7 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(59,102,245,0.35)] transition-all duration-150 hover:bg-[#3259e3] active:scale-[0.98]"
          >
            Open partner signup
          </button>
        </div>
        <p className="mt-4 text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/auth/sign-in" className="font-semibold text-[#3b66f5] hover:underline">
            Manager login
          </Link>
        </p>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
