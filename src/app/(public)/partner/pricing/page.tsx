"use client";

import { EmbeddedCheckoutMount } from "@/components/stripe/embedded-checkout";
import { PricingGoogleContinueButton } from "@/components/auth/pricing-google-continue-button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_PLAN_TIERS, type ManagerPlanTierDefinition, type PlanTierId } from "@/data/manager-plan-tiers";
import {
  normalizeProMonthlyPromoInput,
  PRO_MONTHLY_FIRST_FREE_PROMO_CODE,
} from "@/lib/stripe-promos";
import { loadManagerPlanTiers } from "@/lib/site-content";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isManagerOnboardTier, parseOnboardOfferSearchParams } from "@/lib/manager-onboard-links";

function tierById(tiers: ManagerPlanTierDefinition[], id: PlanTierId) {
  return tiers.find((t) => t.id === id) ?? tiers[0]!;
}

export default function PartnerPricingPage() {
  const router = useRouter();
  const { showToast } = useAppUi();
  /** Default monthly so Pro shows $20/mo and optional first-month promo applies. */
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [selectedTierId, setSelectedTierId] = useState<PlanTierId>("pro");
  const [planTiers, setPlanTiers] = useState<ManagerPlanTierDefinition[]>(MANAGER_PLAN_TIERS);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [onboardOffer, setOnboardOffer] = useState<ReturnType<typeof parseOnboardOfferSearchParams>>({});

  useEffect(() => {
    let cancelled = false;
    loadManagerPlanTiers()
      .then((tiers) => {
        if (!cancelled) setPlanTiers(tiers);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tier = params.get("tier");
    if (tier && isManagerOnboardTier(tier)) {
      setSelectedTierId(tier);
    }

    const offer = parseOnboardOfferSearchParams(params);
    setOnboardOffer(offer);
    if (offer.billing) setBilling(offer.billing);
    if (offer.promo) setCode(offer.promo);
  }, []);

  const selected = useMemo(() => tierById(planTiers, selectedTierId), [planTiers, selectedTierId]);
  const price = billing === "monthly" ? selected.monthly : selected.annual;
  const showAnnualDiscountNote = billing === "annual" && selectedTierId !== "free";

  const onEmbeddedError = useCallback(
    (message: string) => {
      showToast(message);
      setCheckoutClientSecret(null);
    },
    [showToast],
  );

  const onboardDiscountPercent = onboardOffer.discountPercent ?? null;
  const onboardIsFree = onboardDiscountPercent === 100;
  const showOnboardDiscountNote =
    onboardDiscountPercent != null &&
    onboardDiscountPercent > 0 &&
    selectedTierId !== "free" &&
    (onboardIsFree || onboardDiscountPercent < 100);

  const startManagerSignupIntent = useCallback(
    async (opts: {
      tier: PlanTierId;
      billing: "monthly" | "annual";
      promo?: string;
      discountPercent?: number;
    }): Promise<"redirected" | "needs-checkout" | "error"> => {
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
            discountPercent: opts.discountPercent,
          }),
        });
        let payload: { sessionId?: string; error?: string; code?: string };
        try {
          payload = (await res.json()) as { sessionId?: string; error?: string; code?: string };
        } catch {
          showToast("Invalid response from server. Try again.");
          return "error";
        }
        if (!res.ok) {
          // Server is the sole authority on whether a promo waives payment.
          // When it declines, fall back to Stripe checkout instead of toasting.
          if (payload.code === "REQUIRES_CHECKOUT") {
            return "needs-checkout";
          }
          showToast(typeof payload.error === "string" ? payload.error : "Could not start signup.");
          return "error";
        }
        if (payload.sessionId) {
          router.push(`/auth/manager-id?session_id=${encodeURIComponent(payload.sessionId)}`);
          return "redirected";
        }
        showToast("Unexpected signup response.");
        return "error";
      } catch {
        showToast("Network error.");
        return "error";
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
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-foreground sm:text-5xl md:text-[3.25rem]">Start with Axis.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted">
          Choose a tier, fill out the form below, and complete checkout (or free-tier setup). Your plan and contact
          details are confirmed here before you create your property portal account.
        </p>

        {showOnboardDiscountNote ? (
          <p className="mx-auto mt-4 max-w-2xl rounded-2xl border border-[var(--status-confirmed-fg)]/25 bg-[var(--status-confirmed-bg)] px-4 py-3 text-sm font-medium text-[var(--status-confirmed-fg)]">
            {onboardIsFree
              ? "This invite link includes free signup — no payment required."
              : `This invite link includes ${onboardDiscountPercent}% off your first payment (applied automatically at checkout).`}
          </p>
        ) : null}

        <div className="glass-card mt-8 inline-flex items-center gap-1 rounded-full p-1">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-150 ${
              billing === "monthly" ? "btn-cobalt shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling("annual")}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-150 ${
              billing === "annual" ? "btn-cobalt shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            Annual
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                billing === "annual" ? "bg-card/20 text-white" : "bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]"
              }`}
            >
              20% off
            </span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl gap-5 lg:grid-cols-3 lg:items-stretch">
        {planTiers.map((t) => {
          const pb = billing === "monthly" ? t.monthly : t.annual;
          const isSelected = selectedTierId === t.id;
          const isProFeatured = t.id === "pro";
          const cardInner = (
            <>
              <div className="min-h-[28px]">
                {isProFeatured ? (
                  <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Popular
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-accent/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {t.label}
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">{pb.headline}</span>
                {pb.period ? <span className="text-sm font-medium text-muted">{pb.period}</span> : null}
              </div>

              <p className="mt-2 min-h-[4.5rem] text-sm leading-snug text-muted">{pb.sub}</p>

              <button
                type="button"
                onClick={() => setSelectedTierId(t.id)}
                className={`mt-5 min-h-[52px] w-full rounded-2xl py-3 text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${
                  isSelected
                    ? isProFeatured
                      ? "btn-cobalt"
                      : "bg-foreground text-background shadow-inner"
                    : "btn-metallic text-foreground"
                }`}
              >
                {isSelected ? "Selected" : `Choose ${t.label}`}
              </button>

              <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5">
                {t.features.map((f) => (
                  <li key={f.text} className="flex items-start gap-2.5 text-sm">
                    <span className={`mt-0.5 shrink-0 ${f.included ? "text-primary" : "text-muted/40"}`} aria-hidden>
                      <CheckIcon />
                    </span>
                    <span className={f.included ? "text-foreground" : "text-muted/60"}>{f.text}</span>
                  </li>
                ))}
              </ul>
            </>
          );

          if (isProFeatured) {
            return (
              <div
                key={t.id}
                className="rounded-3xl p-[2px]"
                style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--sky) 50%, var(--steel-light) 100%)" }}
              >
                <div
                  className={`flex h-full flex-col rounded-[calc(1.5rem-2px)] glass-card p-7 transition-all duration-200 ${
                    isSelected ? "ring-2 ring-primary/20 shadow-[var(--shadow-card-hover)]" : ""
                  }`}
                >
                  {cardInner}
                </div>
              </div>
            );
          }

          return (
            <div
              key={t.id}
              className={`flex flex-col glass-card rounded-3xl p-7 transition-all duration-200 ${
                isSelected ? "ring-2 ring-primary/25 shadow-[var(--shadow-card-hover)]" : ""
              }`}
            >
              {cardInner}
            </div>
          );
        })}
      </div>

      <div className="glass-card mx-auto mt-10 max-w-5xl rounded-3xl p-1 sm:p-2">
        <div className="rounded-[1.35rem] border border-border/60 bg-card p-6 sm:p-8">
          <div className="flex flex-wrap gap-2 border-b border-border/60 pb-5">
            {planTiers.map((t) => {
              const active = selectedTierId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTierId(t.id)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition-all sm:text-sm ${
                    active ? "btn-cobalt shadow-sm" : "border border-border bg-accent/40 text-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold uppercase tracking-wide text-foreground">
              Get started — {selected.label}
            </p>
            <div className="text-right">
              <p className="text-2xl font-black tracking-tight text-foreground">
                {price.headline}
                {price.period ? <span className="text-base font-semibold text-muted">{price.period}</span> : null}
              </p>
              {selectedTierId !== "free" ? (
                <p className="text-xs text-muted">{billing === "annual" ? "Billed annually" : "Billed monthly"}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-8">
            <PricingGoogleContinueButton
              tier={selectedTierId}
              billing={billing}
              promo={code.trim() || undefined}
              discountPercent={onboardIsFree ? 100 : onboardDiscountPercent}
              disabled={checkoutBusy || Boolean(checkoutClientSecret)}
            />
            <p className="mt-2 text-center text-xs text-muted sm:text-left">
              Use Google to create your account first{selectedTierId === "free" || onboardIsFree ? "" : ", then pay"} — no form required.
            </p>
          </div>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">or enter details manually</span>
            <div className="h-px flex-1 bg-border" aria-hidden />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-foreground" htmlFor="partner-name">
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
              <label className="text-xs font-semibold text-foreground" htmlFor="partner-email">
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
              <label className="text-xs font-semibold text-foreground" htmlFor="partner-phone">
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
              <label className="text-xs font-semibold text-foreground" htmlFor="partner-code">
                Code <span className="font-normal text-muted">(optional)</span>
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
            <div className="glass-card mt-8 rounded-2xl p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-foreground">Complete payment below</p>
                <button
                  type="button"
                  className="btn-metallic self-start rounded-full px-4 py-2 text-sm font-semibold text-foreground"
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

          <div className="mt-8 flex flex-col items-stretch justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row sm:items-center">
            <p
              className={`text-sm ${
                showAnnualDiscountNote ? "font-medium text-[var(--status-confirmed-fg)]" : "text-muted"
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
                    const hasPromo = codeSafe.trim().length > 0;

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

                    if (selectedTierId === "free" || onboardIsFree) {
                      await startManagerSignupIntent({
                        tier: selectedTierId,
                        billing,
                        ...(onboardIsFree ? { discountPercent: 100 } : {}),
                      });
                      return;
                    }

                    // Paid tier with a promo entered: let the server decide whether the
                    // code waives payment. If it does, we redirect; otherwise we fall
                    // through to Stripe checkout. The waiver code is never on the client.
                    if (hasPromo) {
                      const outcome = await startManagerSignupIntent({
                        tier: selectedTierId,
                        billing,
                        promo: codeSafe.trim(),
                        ...(onboardDiscountPercent != null && onboardDiscountPercent < 100
                          ? { discountPercent: onboardDiscountPercent }
                          : {}),
                      });
                      if (outcome !== "needs-checkout") {
                        return;
                      }
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
                          ...(onboardDiscountPercent != null &&
                          onboardDiscountPercent > 0 &&
                          onboardDiscountPercent < 100
                            ? { discountPercent: onboardDiscountPercent }
                            : {}),
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
              className="btn-cobalt inline-flex shrink-0 items-center justify-center rounded-full px-8 py-3 text-sm font-semibold transition-all duration-150 hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
            >
              {checkoutBusy
                ? "Starting…"
                : checkoutClientSecret
                  ? "Checkout open"
                  : selectedTierId === "free" || onboardIsFree
                    ? "Create free account"
                    : `Continue with ${selected.label}`}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-muted sm:text-left">
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
