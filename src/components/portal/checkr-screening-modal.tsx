"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { track } from "@/lib/analytics/track-client";
import { backgroundCheckStatusFromCheckr } from "@/lib/application-background-check";
import { buildDemoBackgroundCheck } from "@/lib/checkr/demo-simulate";
import type { CheckrAddOnSlug } from "@/lib/checkr/packages";
import { checkrOrderCostCents, formatCheckrPrice } from "@/lib/checkr/packages";
import type { CheckrPackage } from "@/lib/checkr/config";
import type { ApplicationBackgroundCheck } from "@/lib/checkr/types";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { MANAGER_PLAN_PORTAL_URL } from "@/lib/portals/manager-plan-path";
import { replaceManagerApplicationRowInCache } from "@/lib/manager-applications-storage";
import type { DemoApplicantRow } from "@/data/demo-portal";

const DEMO_SCREENING_RESOLVE_DELAY_MS = 1800;

type PackageOption = {
  slug: CheckrPackage;
  name: string;
  priceCents: number;
  tagline: string;
  features: string[];
  inheritsLabel?: string;
  popular?: boolean;
};

type AddOnOption = {
  slug: CheckrAddOnSlug;
  name: string;
  priceCents: number;
  description: string;
  badge?: string;
};

const DEMO_PACKAGES: PackageOption[] = [
  {
    slug: "starter",
    name: "Starter",
    priceCents: 2499,
    tagline: "Essential checks for landlords just getting started.",
    features: ["Criminal history", "Global watchlist", "Sex offender registry"],
  },
  {
    slug: "essential",
    name: "Essential",
    priceCents: 3499,
    tagline: "Financials, rental history, and background in one report.",
    inheritsLabel: "Starter",
    features: ["Credit report", "Credit score", "Eviction history"],
    popular: true,
  },
  {
    slug: "complete",
    name: "Complete",
    priceCents: 4499,
    tagline: "Income, employment, and asset verification included.",
    inheritsLabel: "Essential",
    features: ["Income verification", "Assets & bank report"],
  },
];

const DEMO_ADD_ONS: AddOnOption[] = [
  {
    slug: "identity_verification",
    name: "Identity protection",
    priceCents: 295,
    description: "Government ID verification to reduce impersonation risk.",
    badge: "New",
  },
];

/**
 * Package picker + confirmation for Checkr Tenant screening orders.
 */
export function CheckrScreeningModal({
  row,
  open,
  onClose,
  onUpdated,
}: {
  row: DemoApplicantRow | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const { showToast } = useAppUi();
  const isDemo = isDemoModeActive();
  const [configured, setConfigured] = useState(() => isDemo);
  const [screeningAllowed, setScreeningAllowed] = useState(() => isDemo);
  const [packages, setPackages] = useState<PackageOption[]>(() => (isDemo ? DEMO_PACKAGES : []));
  const [addOns, setAddOns] = useState<AddOnOption[]>(() => (isDemo ? DEMO_ADD_ONS : []));
  const [selectedPackage, setSelectedPackage] = useState<CheckrPackage>("essential");
  const [selectedAddOns, setSelectedAddOns] = useState<CheckrAddOnSlug[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bg, setBg] = useState<ApplicationBackgroundCheck | undefined>(() => row?.backgroundCheck);
  const demoResolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || isDemo) return;
    void fetch("/api/screening/packages", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as {
          configured?: boolean;
          screeningAllowed?: boolean;
          packages?: PackageOption[];
          addOns?: AddOnOption[];
        };
        setConfigured(Boolean(body.configured));
        setScreeningAllowed(body.screeningAllowed !== false);
        if (body.packages?.length) setPackages(body.packages);
        if (body.addOns?.length) setAddOns(body.addOns);
      })
      .catch(() => undefined);
  }, [open, isDemo]);

  useEffect(() => {
    if (!open || !row || bg?.status !== "pending" || isDemo) return;
    let cancelled = false;
    const timer = setInterval(() => {
      // Skip the poll for a hidden/background tab (egress on the free plan).
      if (cancelled || document.hidden) return;
      void fetch("/api/screening/background-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ applicationId: row.id, action: "refresh" }),
      })
        .then(async (res) => {
          if (cancelled || !res.ok) return;
          const body = (await res.json()) as { backgroundCheck?: ApplicationBackgroundCheck };
          if (!body.backgroundCheck) return;
          setBg(body.backgroundCheck);
          if (body.backgroundCheck.status === "complete") onUpdated?.();
        })
        .catch(() => undefined);
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, row, bg?.status, onUpdated, isDemo]);

  useEffect(() => () => {
    if (demoResolveTimer.current) clearTimeout(demoResolveTimer.current);
  }, []);

  const totalCents = useMemo(
    () => checkrOrderCostCents(selectedPackage, selectedAddOns),
    [selectedPackage, selectedAddOns],
  );

  const toggleAddOn = (slug: CheckrAddOnSlug) => {
    setSelectedAddOns((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));
  };

  const confirm = useCallback(async () => {
    if (!row) return;
    setBusy(true);
    setError(null);
    track("background_check_started", { provider: "checkr", package: selectedPackage });

    if (isDemo) {
      const pending: ApplicationBackgroundCheck = {
        provider: "checkr",
        candidateId: `demo_applicant_${row.id}`,
        reportId: `demo_order_${row.id}`,
        packageSlug: selectedPackage,
        addOnProducts: selectedAddOns.length > 0 ? selectedAddOns : undefined,
        status: "pending",
        result: null,
        orderedAt: new Date().toISOString(),
        simulated: true,
        costCents: 0,
      };
      setBg(pending);
      setBusy(false);
      showToast("Demo screening started — no real charge. Results resolve in a few seconds.");
      if (demoResolveTimer.current) clearTimeout(demoResolveTimer.current);
      demoResolveTimer.current = setTimeout(() => {
        const resolved = buildDemoBackgroundCheck(row, { packageSlug: selectedPackage, addOnProducts: selectedAddOns });
        setBg(resolved);
        replaceManagerApplicationRowInCache({
          ...row,
          backgroundCheck: resolved,
          backgroundCheckStatus: backgroundCheckStatusFromCheckr(resolved),
        });
        onUpdated?.();
      }, DEMO_SCREENING_RESOLVE_DELAY_MS);
      return;
    }

    try {
      const res = await fetch("/api/screening/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          applicationId: row.id,
          packageSlug: selectedPackage,
          addOnProducts: selectedAddOns,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        code?: string;
        url?: string;
        ran?: boolean;
        backgroundCheck?: ApplicationBackgroundCheck;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not start screening.");
        return;
      }
      // Simulate-only environments run immediately with no payment.
      if (body.ran) {
        if (body.backgroundCheck) setBg(body.backgroundCheck);
        showToast("Screening started.");
        onUpdated?.();
        return;
      }
      if (!body.url) {
        setError("Stripe did not return a payment page.");
        return;
      }
      showToast("Opening Stripe — screening starts once payment completes.");
      window.location.assign(body.url);
      return;
    } catch {
      setError("Network error starting screening.");
    } finally {
      setBusy(false);
    }
  }, [row, onUpdated, showToast, isDemo, selectedPackage, selectedAddOns]);

  if (!row) return null;

  const canRun = screeningAllowed && configured && Boolean(row.application?.consentCredit) && bg?.status !== "pending";

  return (
    <Modal open={open} onClose={onClose} title={`Run screening — ${row.name}`} panelClassName="max-w-4xl">
      <div className="space-y-5 text-sm">
        {!screeningAllowed ? (
          <>
            <p className="native-hide text-muted">
              Applicant screening requires Pro or Business.{" "}
              <Link href={MANAGER_PLAN_PORTAL_URL} className="font-semibold text-primary hover:underline">
                Upgrade your plan
              </Link>{" "}
              to run background checks.
            </p>
            <p className="native-only text-muted">
              Applicant screening isn&apos;t included on your current plan.
            </p>
          </>
        ) : !configured ? (
          <p className="text-muted">Background checks are not configured. Add CHECKR_API_KEY to enable Checkr Tenant.</p>
        ) : !row.application?.consentCredit ? (
          <p className="text-muted">This applicant has not authorized a background check.</p>
        ) : (
          <>
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Select a package</p>
              <div className="grid gap-3 lg:grid-cols-3">
                {packages.map((pkg) => {
                  const active = selectedPackage === pkg.slug;
                  return (
                    <button
                      key={pkg.slug}
                      type="button"
                      data-attr={`screening-package-${pkg.slug}`}
                      className={`rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                      onClick={() => setSelectedPackage(pkg.slug)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-foreground">{pkg.name}</p>
                        {pkg.popular ? (
                          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                            Most popular
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                        {formatCheckrPrice(pkg.priceCents)}
                        <span className="text-xs font-normal text-muted"> / screening</span>
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-muted">{pkg.tagline}</p>
                      {pkg.inheritsLabel ? (
                        <p className="mt-2 text-xs font-medium text-foreground">Everything in {pkg.inheritsLabel}</p>
                      ) : null}
                      <ul className="mt-2 space-y-1 text-xs text-muted">
                        {pkg.features.map((feature) => (
                          <li key={feature}>· {feature}</li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>

            {addOns.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Add-ons</p>
                {addOns.map((addOn) => {
                  const on = selectedAddOns.includes(addOn.slug);
                  return (
                    <label
                      key={addOn.slug}
                      className={`flex cursor-pointer items-start justify-between gap-3 rounded-2xl border p-4 ${
                        on ? "border-primary bg-primary/5" : "border-border bg-card"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          {addOn.name}
                          {addOn.badge ? (
                            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
                              {addOn.badge}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-xs text-muted">{addOn.description}</p>
                        <p className="mt-1 text-xs font-semibold text-primary">+{formatCheckrPrice(addOn.priceCents)} per screening</p>
                      </div>
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-border accent-primary"
                        checked={on}
                        onChange={() => toggleAddOn(addOn.slug)}
                        aria-label={`Add ${addOn.name}`}
                      />
                    </label>
                  );
                })}
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-foreground/5 p-3">
              {isDemo ? (
                <>
                  <p className="font-semibold text-foreground">Demo mode — no real charge</p>
                  <p className="mt-1 text-xs text-muted">
                    Uses Checkr Tenant test scenarios when applicant data matches canned profiles (e.g. Herbert Humphrey,
                    Tim Watkins). Otherwise returns a deterministic clear/consider result.
                  </p>
                </>
              ) : (
                <p className="font-semibold text-foreground">Total: {formatCheckrPrice(totalCents)} per run</p>
              )}
            </div>
          </>
        )}

        {error ? <p className="rounded-xl border px-3 py-2 text-xs portal-banner-pending">{error}</p> : null}

        {bg?.result === "consider" ? (
          <p className="rounded-xl border px-3 py-2 text-xs portal-banner-pending">
            Checkr flagged records to review. Consult the full report and applicable fair-chance rules before any
            adverse action (FCRA).
          </p>
        ) : null}

        <div
          data-portal-detail-actions=""
          className="flex flex-wrap items-center justify-end gap-3 border-t border-border py-6 sm:gap-4"
        >
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {screeningAllowed && configured && row.application?.consentCredit ? (
            <Button
              type="button"
              data-attr="run-screening-checkr"
              disabled={busy || !canRun}
              onClick={() => void confirm()}
            >
              {busy
                ? "Starting…"
                : bg
                  ? "Re-run screening"
                  : isDemo
                    ? "Confirm — $0.00"
                    : `Pay & run — ${formatCheckrPrice(totalCents)}`}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
