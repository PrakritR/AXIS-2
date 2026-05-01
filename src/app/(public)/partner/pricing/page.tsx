"use client";

import { EmbeddedCheckoutMount } from "@/components/stripe/embedded-checkout";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  FULL_PAYMENT_WAIVER_PROMO_CODE,
  normalizeProMonthlyPromoInput,
  PRO_MONTHLY_FIRST_FREE_PROMO_CODE,
} from "@/lib/stripe-promos";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type TierId = "free" | "pro" | "business";

type PriceBlock = {
  headline: string;
  period: string | null;
  sub: string;
};

const TIERS: {
  id: TierId;
  label: string;
  tabLabel: string;
  ctaVerb: string;
  monthly: PriceBlock;
  annual: PriceBlock;
  features: { text: string; included: boolean }[];
}[] = [
  {
    id: "free",
    label: "Free Tier",
    tabLabel: "Free Tier",
    ctaVerb: "Free",
    monthly: {
      headline: "Free",
      period: null,
      sub: "List properties, collect rent, and run applications.",
    },
    annual: {
      headline: "Free",
      period: null,
      sub: "List properties, collect rent, and run applications.",
    },
    features: [
      { text: "Property listings", included: true },
      { text: "Rent collection access", included: true },
      { text: "Application process", included: true },
      { text: "Lease generation access", included: false },
      { text: "Work order system", included: false },
    ],
  },
  {
    id: "pro",
    label: "Pro Tier",
    tabLabel: "Pro Tier",
    ctaVerb: "Pro",
    monthly: {
      headline: "$20",
      period: "/ month",
      sub: "Everything in Free, plus leases & work orders — up to 2 properties.",
    },
    annual: {
      headline: "$192",
      period: "/ year",
      sub: "Everything in Free, plus leases & work orders — up to 2 properties, 20% off annual billing.",
    },
    features: [
      { text: "Property listings", included: true },
      { text: "Rent collection access", included: true },
      { text: "Application process", included: true },
      { text: "Lease generation access", included: true },
      { text: "Work order system", included: true },
      { text: "Manage up to 2 properties", included: true },
    ],
  },
  {
    id: "business",
    label: "Business Tier",
    tabLabel: "Business Tier",
    ctaVerb: "Business",
    monthly: {
      headline: "$200",
      period: "/ month",
      sub: "Everything in Pro — up to 20 properties & admin support.",
    },
    annual: {
      headline: "$1,920",
      period: "/ year",
      sub: "Everything in Pro — up to 20 properties & admin support, 20% off annual billing.",
    },
    features: [
      { text: "Property listings", included: true },
      { text: "Rent collection access", included: true },
      { text: "Application process", included: true },
      { text: "Lease generation access", included: true },
      { text: "Work order system", included: true },
      { text: "Manage up to 20 properties", included: true },
      { text: "Direct meetings with admins for support", included: true },
    ],
  },
];

function tierById(id: TierId) {
  return TIERS.find((t) => t.id === id)!;
}

export default function PartnerPricingPage() {
  const router = useRouter();
  const { showToast } = useAppUi();
  /** Default monthly so Pro shows $20/mo and optional first-month promo applies. */
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [selectedTierId, setSelectedTierId] = useState<TierId>("pro");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);

  const selected = useMemo(() => tierById(selectedTierId), [selectedTierId]);
  const price = billing === "monthly" ? selected.monthly : selected.annual;
  const showAnnualDiscountNote = billing === "annual" && selectedTierId !== "free";

  const onEmbeddedError = useCallback(
    (message: string) => {
      showToast(message);
      setCheckoutClientSecret(null);
    },
    [showToast],
  );

  const startManagerSignupIntent = useCallback(
    async (opts: { tier: TierId; billing: "monthly" | "annual"; promo?: string }) => {
      setCheckoutBusy(true);
      try {
        const res = await fetch("/api/manager/signup-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tier: opts.tier,
            billing: opts.billing,
            email: typeof email === "string" ? email.trim() : "",
            fullName: typeof fullName === "string" ? fullName.trim() : "",
            phone: typeof phone === "string" ? phone.trim() : "",
            promo: opts.promo,
          }),
        });
        let payload: { sessionId?: string; error?: string };
        try {
          payload = (await res.json()) as { sessionId?: string; error?: string };
        } catch {
          showToast("Invalid response from server. Try again.");
          return;
        }
        if (!res.ok) {
          showToast(typeof payload.error === "string" ? payload.error : "Could not start signup.");
          return;
        }
        if (payload.sessionId) {
          router.push(`/auth/manager-id?session_id=${encodeURIComponent(payload.sessionId)}`);
          return;
        }
        showToast("Unexpected signup response.");
      } catch {
        showToast("Network error.");
      } finally {
        setCheckoutBusy(false);
      }
    },
    [email, fullName, phone, router, showToast],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    if (sid) {
      window.history.replaceState({}, "", "/partner/pricing");
      router.replace(`/auth/manager-id?session_id=${encodeURIComponent(sid)}`);
    }
  }, [router]);

  return (
    <div className="min-h-screen px-4 py-14 sm:px-5 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Partner pricing</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-[#0d1f4e] sm:text-5xl md:text-[3.25rem]">Start with Axis.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-500">
          Choose a tier, fill out the form below, and complete checkout (or free-tier setup). Your plan and contact
          details are confirmed here before you create your property portal account.
        </p>

        <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-150 ${
              billing === "monthly" ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling("annual")}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-150 ${
              billing === "annual" ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Annual
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                billing === "annual" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              20% off
            </span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl gap-5 lg:grid-cols-3">
        {TIERS.map((t) => {
          const pb = billing === "monthly" ? t.monthly : t.annual;
          const isSelected = selectedTierId === t.id;
          return (
            <div
              key={t.id}
              className={`flex flex-col rounded-3xl border bg-white p-7 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.1)] transition-all duration-200 ${
                isSelected
                  ? "border-primary ring-2 ring-primary/25 shadow-[0_8px_32px_-8px_rgba(0,122,255,0.28)]"
                  : "border-slate-200/80 hover:border-slate-300"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t.label}</p>

              <div className="mt-4 flex flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-5xl font-black tracking-tight text-[#0d1f4e]">{pb.headline}</span>
                {pb.period ? <span className="text-sm font-medium text-slate-400">{pb.period}</span> : null}
              </div>

              <p className="mt-2 text-sm text-slate-400">{pb.sub}</p>

              <button
                type="button"
                onClick={() => setSelectedTierId(t.id)}
                className={`mt-6 w-full rounded-2xl py-3 text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${
                  isSelected
                    ? "bg-[#0d1f4e] text-white shadow-inner"
                    : "border border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {isSelected ? "Selected" : `Choose ${t.ctaVerb}`}
              </button>

              <div className="my-6 border-t border-slate-100" />

              <ul className="space-y-3">
                {t.features.map((f) => (
                  <li key={f.text} className="flex items-center gap-3 text-sm">
                    <span className={f.included ? "text-primary" : "text-slate-300"} aria-hidden>
                      <CheckIcon />
                    </span>
                    <span className={f.included ? "text-slate-700" : "text-slate-400"}>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mx-auto mt-10 max-w-5xl rounded-3xl border border-slate-200/80 bg-[#f8fafc] p-1 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.1)] sm:p-2">
        <div className="rounded-[1.35rem] border border-slate-200/80 bg-white p-6 sm:p-8">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-5">
            {TIERS.map((t) => {
              const active = selectedTierId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTierId(t.id)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition-all sm:text-sm ${
                    active ? "bg-primary text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t.tabLabel}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold uppercase tracking-wide text-[#0d1f4e]">
              Get started — {selected.label}
            </p>
            <div className="text-right">
              <p className="text-2xl font-black tracking-tight text-[#0d1f4e]">
                {price.headline}
                {price.period ? <span className="text-base font-semibold text-slate-500">{price.period}</span> : null}
              </p>
              {selectedTierId !== "free" ? (
                <p className="text-xs text-slate-400">{billing === "annual" ? "Billed annually" : "Billed monthly"}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#334155]" htmlFor="partner-name">
                Full name
              </label>
              <Input
                id="partner-name"
                className="mt-1.5"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#334155]" htmlFor="partner-email">
                Email
              </label>
              <Input
                id="partner-email"
                className="mt-1.5"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#334155]" htmlFor="partner-phone">
                Phone
              </label>
              <Input
                id="partner-phone"
                className="mt-1.5"
                type="tel"
                placeholder="(206) 555-0100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#334155]" htmlFor="partner-code">
                Code <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Input
                id="partner-code"
                className="mt-1.5"
                placeholder="Promo or referral code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              {normalizeProMonthlyPromoInput(typeof code === "string" ? code : "") === PRO_MONTHLY_FIRST_FREE_PROMO_CODE &&
                selectedTierId !== "free" &&
                (selectedTierId !== "pro" || billing !== "monthly") ? (
                <p className="mt-1.5 text-xs text-amber-800">
                  {PRO_MONTHLY_FIRST_FREE_PROMO_CODE} only applies to <span className="font-semibold">Pro</span> with{" "}
                  <span className="font-semibold">monthly</span> billing.
                </p>
              ) : null}
            </div>
          </div>

          {checkoutClientSecret ? (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-slate-900">Complete payment below</p>
                <button
                  type="button"
                  className="self-start rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setCheckoutClientSecret(null)}
                >
                  Cancel
                </button>
              </div>
              <div className="mt-4">
                <EmbeddedCheckoutMount clientSecret={checkoutClientSecret} onError={onEmbeddedError} />
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col items-stretch justify-between gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">
            <p
              className={`text-sm ${
                showAnnualDiscountNote ? "font-medium text-emerald-700" : "text-slate-500"
              }`}
            >
              {showAnnualDiscountNote
                ? "20% off applied."
                : selectedTierId === "free"
                  ? "No payment required for the free tier."
                  : billing === "monthly"
                    ? "Switch to annual for 20% off."
                    : ""}
            </p>
            <button
              type="button"
              disabled={checkoutBusy || Boolean(checkoutClientSecret)}
              onClick={() => {
                void (async () => {
                  try {
                    const emailSafe = typeof email === "string" ? email : "";
                    const fullNameSafe = typeof fullName === "string" ? fullName : "";
                    const codeSafe = typeof code === "string" ? code : "";
                    if (!emailSafe.trim() || !fullNameSafe.trim()) {
                      showToast("Enter your full name and email before checkout.");
                      return;
                    }
                    const normalizedPromo = normalizeProMonthlyPromoInput(codeSafe);
                    const isProMonthly = selectedTierId === "pro" && billing === "monthly";
                    const isFullWaiver = normalizedPromo === FULL_PAYMENT_WAIVER_PROMO_CODE;

                    if (
                      normalizedPromo === PRO_MONTHLY_FIRST_FREE_PROMO_CODE &&
                      selectedTierId !== "free" &&
                      !isProMonthly
                    ) {
                      showToast(
                        `${PRO_MONTHLY_FIRST_FREE_PROMO_CODE} is only valid for Pro monthly. Switch tier or billing, or clear the code.`,
                      );
                      return;
                    }

                    if (selectedTierId === "free" || isFullWaiver) {
                      await startManagerSignupIntent({
                        tier: selectedTierId,
                        billing,
                        promo: isFullWaiver ? FULL_PAYMENT_WAIVER_PROMO_CODE : undefined,
                      });
                      return;
                    }

                    setCheckoutBusy(true);
                    try {
                      const res = await fetch("/api/stripe/checkout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          tier: selectedTierId,
                          billing,
                          email: emailSafe.trim(),
                          fullName: fullNameSafe.trim(),
                          phone: typeof phone === "string" ? phone.trim() : "",
                          embedded: true,
                          ...(isProMonthly && codeSafe.trim() ? { promo: normalizedPromo } : {}),
                        }),
                      });
                      const payload = (await res.json()) as { clientSecret?: string; url?: string; error?: string };
                      if (!res.ok) {
                        showToast(payload.error ?? "Could not start checkout. Ask your admin to configure billing.");
                        return;
                      }
                      if (payload.clientSecret) {
                        setCheckoutClientSecret(payload.clientSecret);
                        return;
                      }
                      if (payload.url) {
                        window.location.href = payload.url;
                        return;
                      }
                      showToast("Unexpected checkout response.");
                    } catch {
                      showToast("Network error starting checkout.");
                    } finally {
                      setCheckoutBusy(false);
                    }
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : "Something went wrong. Try again.";
                    showToast(msg);
                  }
                })();
              }}
              className="inline-flex shrink-0 items-center justify-center rounded-full px-8 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(0,122,255,0.28)] transition-all duration-150 hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-alt))" }}
            >
              {checkoutBusy ? "Starting…" : checkoutClientSecret ? "Checkout open" : `Continue with ${selected.label}`}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-400 sm:text-left">
            Already have an account?{" "}
            <Link href="/auth/sign-in" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
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
