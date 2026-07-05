"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { track } from "@/lib/analytics/track-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { StripeEmbeddedCheckout } from "@/components/stripe-embedded-checkout";
import { MANAGER_TABLE_TH, ManagerPortalFilterRow, ManagerPortalPageShell, ManagerPortalStatusPills, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { usePortalSession } from "@/hooks/use-portal-session";
import { useNativePlatform } from "@/hooks/use-native-platform";
import {
  chargeDueLabel,
  HOUSEHOLD_CHARGES_EVENT,
  HOUSEHOLD_CHARGES_SESSION_KEY,
  isHouseholdChargeOverdue,
  linkHouseholdChargesToResidentUser,
  readChargesForResident,
  syncHouseholdChargesFromServer,
  type HouseholdCharge,
} from "@/lib/household-charges";
import { syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { canPayHouseholdChargeWithAxisAch } from "@/lib/household-charge-payment-eligibility";
import {
  residentPaymentMethodLabel,
  residentProcessingFeeDisplayLabel,
  acceptedPaymentMethodsForListing,
  isResidentAcceptedPaymentMethod,
  RESIDENT_ACCEPTED_PAYMENT_METHOD_LABELS,
  type ResidentAxisPaymentMethod,
  type ResidentAcceptedPaymentMethod,
} from "@/lib/payment-policy";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { nativePlatformRequestHeaders } from "@/lib/platform/native-client";
import { residentPaymentMethodsForSurface } from "@/lib/platform/resident-payments";
import { safeFormatDateTime } from "@/lib/pacific-time";

type PayTab = "pending" | "paid";

type CheckoutState = {
  key: string;
  chargeIds: string[];
  paymentMethod: ResidentAxisPaymentMethod;
  clientSecret: string | null;
  loading: boolean;
  error: string | null;
  subtotalCents?: number;
  processingFeeCents?: number;
  axisFeeCents?: number;
  totalCents?: number;
};

const PAYMENT_METHOD_OPTIONS: {
  id: ResidentAxisPaymentMethod;
  title: string;
  description: string;
}[] = [
  {
    id: "ach",
    title: "Bank (ACH)",
    description: "Lowest fee — clears in 3–5 business days",
  },
  {
    id: "link",
    title: "Link",
    description: "Pay faster with Stripe Link",
  },
  {
    id: "card",
    title: "Credit card",
    description: "Instant card payment",
  },
];

function centsFromLabel(label: string): number {
  const n = Number(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function checkoutKey(chargeIds: string[], paymentMethod: ResidentAxisPaymentMethod): string {
  return `${[...chargeIds].sort().join(",")}:${paymentMethod}`;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ResidentPaymentsPanel() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const router = useRouter();
  const session = usePortalSession();
  const nativePlatform = useNativePlatform();
  const isNativeApp = nativePlatform !== null;
  const availablePaymentMethods = useMemo(
    () => residentPaymentMethodsForSurface(isNativeApp),
    [isNativeApp],
  );
  const paymentMethodOptions = useMemo(
    () => PAYMENT_METHOD_OPTIONS.filter((option) => availablePaymentMethods.includes(option.id)),
    [availablePaymentMethods],
  );
  const [tab, setTab] = useState<PayTab>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [paymentMethod, setPaymentMethod] = useState<ResidentAxisPaymentMethod>("ach");
  const [tick, setTick] = useState(0);
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [preferredMethod, setPreferredMethod] = useState<ResidentAcceptedPaymentMethod | null>(null);
  const [preferredMethodModalOpen, setPreferredMethodModalOpen] = useState(false);
  const [preferredMethodSaving, setPreferredMethodSaving] = useState(false);
  const email = session.email?.trim() ?? null;
  const userId = session.userId;

  useEffect(() => {
    if (!availablePaymentMethods.includes(paymentMethod)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fall back to a valid payment method when the list changes
      setPaymentMethod(availablePaymentMethods[0] ?? "ach");
      setCheckout(null);
    }
  }, [availablePaymentMethods, paymentMethod]);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const on = () => refresh();
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    const onStorage = (e: StorageEvent) => {
      if (e.key === HOUSEHOLD_CHARGES_SESSION_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  useEffect(() => {
    if (!session.ready) return;
    if (session.userId && email) linkHouseholdChargesToResidentUser(email, session.userId);
    void (async () => {
      await syncManagerApplicationsFromServer({ force: true });
      await syncPropertyPipelineFromServer({ force: true });
      await syncHouseholdChargesFromServer(true, { skipReconcile: true });
    })().finally(refresh);
  }, [email, refresh, session.ready, session.userId]);

  useEffect(() => {
    if (!session.ready || !session.userId || isDemoModeActive()) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase
          .from("profiles")
          .select("preferred_payment_method")
          .eq("id", session.userId)
          .maybeSingle();
        if (cancelled) return;
        const raw = data?.preferred_payment_method;
        setPreferredMethod(isResidentAcceptedPaymentMethod(raw) ? raw : null);
      } catch {
        /* env missing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.ready, session.userId]);

  useEffect(() => {
    const achCheckout = searchParams.get("ach_checkout");
    const sessionId = searchParams.get("session_id")?.trim();
    if (!achCheckout || !sessionId) return;

    if (achCheckout === "cancel") {
      showToast("Bank payment cancelled.");
      router.replace("/resident/payments");
      return;
    }

    if (achCheckout !== "success" && achCheckout !== "return") return;

    void (async () => {
      const res = await fetch(`/api/stripe/household-charge-verify?session_id=${encodeURIComponent(sessionId)}`);
      const data = (await res.json().catch(() => ({}))) as {
        paid?: boolean;
        processing?: boolean;
        error?: string;
      };

      if (!res.ok) {
        showToast(typeof data.error === "string" ? data.error : "Could not verify bank payment.");
        router.replace("/resident/payments");
        return;
      }

      if (data.paid) {
        await syncHouseholdChargesFromServer(true, { skipReconcile: true });
        refresh();
        setCheckout(null);
        setSelectedIds(new Set());
        showToast("Payment received — thank you.");
      } else if (data.processing) {
        showToast("Bank transfer submitted. We will mark this paid when the transfer clears (usually 3–5 business days).");
      } else {
        showToast(typeof data.error === "string" ? data.error : "Payment not completed yet.");
      }
      router.replace("/resident/payments");
    })();
  }, [refresh, router, searchParams, showToast]);

  const charges = useMemo(() => {
    void tick;
    if (!email) return [] as HouseholdCharge[];
    return readChargesForResident(email, userId);
  }, [email, userId, tick]);

  const unpaidAchCharges = useMemo(
    () => charges.filter((c) => c.status === "pending" && canPayHouseholdChargeWithAxisAch(c)),
    [charges],
  );

  const acceptedMethods = useMemo(() => {
    const withSnapshot = charges.find((c) => c.acceptedPaymentMethodsSnapshot?.length);
    return acceptedPaymentMethodsForListing(
      withSnapshot ? { acceptedPaymentMethods: withSnapshot.acceptedPaymentMethodsSnapshot } : null,
    );
  }, [charges]);

  const effectivePreferredMethod = preferredMethod && acceptedMethods.includes(preferredMethod) ? preferredMethod : null;

  const rows = useMemo(() => {
    const filtered = charges.filter((c) => (tab === "pending" ? c.status === "pending" : c.status === "paid"));
    if (tab !== "pending") return filtered;
    // Overdue charges surface at the top of the unpaid list.
    return [...filtered].sort((a, b) => {
      const aOverdue = isHouseholdChargeOverdue(a);
      const bOverdue = isHouseholdChargeOverdue(b);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return 0;
    });
  }, [charges, tab]);

  const counts = useMemo(() => {
    return {
      pending: charges.filter((c) => c.status === "pending").length,
      paid: charges.filter((c) => c.status === "paid").length,
      overdue: charges.filter((c) => c.status === "pending" && isHouseholdChargeOverdue(c)).length,
    };
  }, [charges]);

  const tabs = useMemo(
    () =>
      [
        { id: "pending" as const, label: "Unpaid", count: counts.pending },
        { id: "paid" as const, label: "Paid", count: counts.paid },
      ] as const,
    [counts],
  );

  const loadCheckout = useCallback(
    async (chargeIds: string[], method: ResidentAxisPaymentMethod) => {
      const ids = [...new Set(chargeIds.map((id) => id.trim()).filter(Boolean))];
      if (ids.length === 0) return;
      // In the public /demo sandbox there is no real Stripe session and the
      // checkout route requires auth — keep the visitor inside the demo.
      if (isDemoModeActive()) {
        showToast("Payments are simulated in this demo.");
        return;
      }
      const key = checkoutKey(ids, method);
      setCheckout({ key, chargeIds: ids, paymentMethod: method, clientSecret: null, loading: true, error: null });
      track("household_charge_payment_started", { method, charge_count: ids.length });
      try {
        const res = await fetch("/api/stripe/household-charge-checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...nativePlatformRequestHeaders(nativePlatform),
          },
          body: JSON.stringify({ chargeIds: ids, embedded: true, paymentMethod: method }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          clientSecret?: string;
          url?: string;
          error?: string;
          subtotalCents?: number;
          processingFeeCents?: number;
          axisFeeCents?: number;
          totalCents?: number;
        };
        if (!res.ok) {
          setCheckout({
            key,
            chargeIds: ids,
            paymentMethod: method,
            clientSecret: null,
            loading: false,
            error: typeof payload.error === "string" ? payload.error : "Could not start payment.",
          });
          return;
        }
        if (payload.clientSecret) {
          setCheckout({
            key,
            chargeIds: ids,
            paymentMethod: method,
            clientSecret: payload.clientSecret,
            loading: false,
            error: null,
            subtotalCents: payload.subtotalCents,
            processingFeeCents: payload.processingFeeCents,
            axisFeeCents: payload.axisFeeCents,
            totalCents: payload.totalCents,
          });
          return;
        }
        if (payload.url && typeof window !== "undefined") {
          window.location.href = payload.url;
        }
      } catch {
        setCheckout({
          key,
          chargeIds: ids,
          paymentMethod: method,
          clientSecret: null,
          loading: false,
          error: "Could not start payment.",
        });
      }
    },
    [nativePlatform, showToast],
  );

  async function savePreferredMethod(method: ResidentAcceptedPaymentMethod) {
    setPreferredMethodSaving(true);
    try {
      if (isDemoModeActive()) {
        setPreferredMethod(method);
        showToast("Payment method simulated in this demo.");
        setPreferredMethodModalOpen(false);
        return;
      }
      if (!userId) {
        showToast("Sign in to set a payment method.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("profiles")
        .update({ preferred_payment_method: method })
        .eq("id", userId);
      if (error) {
        showToast("Could not save payment method.");
        return;
      }
      setPreferredMethod(method);
      showToast("Payment method saved.");
      setPreferredMethodModalOpen(false);
    } finally {
      setPreferredMethodSaving(false);
    }
  }

  const toggleSelected = (chargeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chargeId)) next.delete(chargeId);
      else next.add(chargeId);
      return next;
    });
  };

  const selectAllUnpaidAch = () => {
    setSelectedIds(new Set(unpaidAchCharges.map((c) => c.id)));
  };

  const showBulkCheckoutBar = Boolean(checkout);

  const renderPaymentMethodPicker = () => {
    if (paymentMethodOptions.length <= 1) {
      const sole = paymentMethodOptions[0];
      if (!sole) return null;
      return (
        <div className="rounded-xl border border-border bg-card/50 px-3 py-3">
          <p className="text-sm font-semibold text-foreground">{sole.title}</p>
          <p className="mt-1 text-xs text-muted">{sole.description}</p>
          <p className="mt-2 text-xs font-medium text-foreground">{residentProcessingFeeDisplayLabel(sole.id)}</p>
          {isNativeApp ? (
            <p className="mt-2 text-xs text-muted">In the Axis app, rent is paid by bank transfer (ACH) through Stripe.</p>
          ) : null}
        </div>
      );
    }

    return (
    <div className="grid gap-2 sm:grid-cols-3">
      {paymentMethodOptions.map((option) => {
        const selected = paymentMethod === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setPaymentMethod(option.id);
              setCheckout(null);
            }}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <p className="text-sm font-semibold text-foreground">{option.title}</p>
            <p className="mt-1 text-xs text-muted">{option.description}</p>
            <p className="mt-2 text-xs font-medium text-foreground">{residentProcessingFeeDisplayLabel(option.id)}</p>
          </button>
        );
      })}
    </div>
    );
  };

  const renderCheckoutBlock = (label: string) => {
    if (!checkout) return null;
    const method = checkout.paymentMethod;
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {renderPaymentMethodPicker()}
        {checkout.totalCents != null && checkout.subtotalCents != null ? (
          <p className="text-xs text-muted">
            Subtotal {formatUsd(checkout.subtotalCents)}
            {checkout.processingFeeCents ? ` · Processing ${formatUsd(checkout.processingFeeCents)}` : ""}
            {checkout.axisFeeCents ? ` · Axis fee ${formatUsd(checkout.axisFeeCents)}` : ""}
            {" · "}
            <span className="font-semibold text-foreground">Total {formatUsd(checkout.totalCents)}</span>
          </p>
        ) : null}
        {checkout.loading ? (
          <p className="text-sm text-muted">Loading secure checkout…</p>
        ) : checkout.error ? (
          <p className="rounded-xl border px-4 py-3 text-sm portal-banner-danger">{checkout.error}</p>
        ) : checkout.clientSecret ? (
          <StripeEmbeddedCheckout clientSecret={checkout.clientSecret} />
        ) : null}
        <p className="text-xs text-muted">
          Pay with {residentPaymentMethodLabel(method)} through Stripe — {residentProcessingFeeDisplayLabel(method)}
          {checkout.axisFeeCents ? ` plus a small Axis service fee` : ""}.
          {method === "ach" ? " Transfers typically clear in 3–5 business days." : " Card and Link payments confirm instantly."}
        </p>
      </div>
    );
  };

  const renderRowDetail = (row: HouseholdCharge) => {
    return (
      <>
        {row.status === "paid" ? (
          <p className="mb-3 text-sm text-foreground">
            <span className="font-semibold">{row.title}</span> — Paid
            {row.paidAt ? <span className="ml-1 text-xs text-muted">({safeFormatDateTime(row.paidAt)})</span> : null}
          </p>
        ) : (
          <p className="mb-3 text-sm text-muted">
            Due: <span className="font-semibold text-foreground">{chargeDueLabel(row)}</span>
          </p>
        )}
        <PortalTableDetailActions>
          <Button
            type="button"
            variant="outline"
            className={PORTAL_DETAIL_BTN}
            onClick={() => {
              void navigator.clipboard?.writeText(row.balanceLabel);
              showToast("Balance copied.");
            }}
          >
            Copy balance
          </Button>
          <Link
            href="/resident/lease"
            className={`inline-flex items-center justify-center ${PORTAL_DETAIL_BTN}`}
          >
            Lease tab
          </Link>
        </PortalTableDetailActions>
      </>
    );
  };

  return (
    <>
    <ManagerPortalPageShell
      title="Payments"
      titleAside={
        <>
          <Button
            type="button"
            variant="outline"
            className={`shrink-0 rounded-full text-xs ${PORTAL_HEADER_ACTION_BTN}`}
            onClick={() => setPreferredMethodModalOpen(true)}
            data-attr="resident-set-payment-method"
          >
            {effectivePreferredMethod
              ? `Payment method: ${RESIDENT_ACCEPTED_PAYMENT_METHOD_LABELS[effectivePreferredMethod]}`
              : "Set payment method"}
          </Button>
          {tab === "pending" && unpaidAchCharges.length > 0 ? (
            <Button
              type="button"
              variant="primary"
              className={`shrink-0 rounded-full text-xs ${PORTAL_HEADER_ACTION_BTN}`}
              onClick={() => {
                const ids = selectedIds.size > 0 ? [...selectedIds] : unpaidAchCharges.map((c) => c.id);
                setExpandedId(null);
                void loadCheckout(ids, paymentMethod);
              }}
              data-attr="resident-pay-charges"
            >
              {selectedIds.size > 0 ? "Pay selected" : "Pay all"}
            </Button>
          ) : null}
        </>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills
            tabs={[...tabs]}
            activeId={tab}
            onChange={(id) => {
              setTab(id as PayTab);
              setExpandedId(null);
              setCheckout(null);
            }}
          />
          {counts.overdue > 0 ? (
            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--status-overdue-fg)_30%,transparent)] bg-[var(--status-overdue-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--status-overdue-fg)]">
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {counts.overdue} overdue
            </div>
          ) : null}
          {tab === "pending" && unpaidAchCharges.length > 0 ? (
            <Button type="button" variant="outline" className={`shrink-0 rounded-full text-xs ${PORTAL_HEADER_ACTION_BTN}`} onClick={selectAllUnpaidAch}>
              Select all
            </Button>
          ) : null}
        </ManagerPortalFilterRow>
      }
    >
      {!email ? (
        <p className="text-sm text-muted">Sign in to see your application fees, rent, and deposits.</p>
      ) : (
        <>
          {showBulkCheckoutBar && checkout ? (
            <div className="mb-6 glass-card rounded-2xl border border-border p-4">
              {renderCheckoutBlock(
                checkout.chargeIds.length > 1
                  ? `Pay ${checkout.chargeIds.length} charges (${formatUsd(
                      checkout.chargeIds.reduce((sum, id) => {
                        const charge = charges.find((c) => c.id === id);
                        return sum + (charge ? centsFromLabel(charge.balanceLabel) : 0);
                      }, 0),
                    )})`
                  : `Pay online (${residentPaymentMethodLabel(checkout?.paymentMethod ?? paymentMethod)})`,
              )}
            </div>
          ) : null}
          {rows.length === 0 ? (
            <PortalDataTableEmpty
              icon="payment"
              message={
                charges.length === 0
                  ? "No charges yet."
                  : tab === "pending"
                    ? "No unpaid charges yet."
                    : "No paid charges yet."
              }
            />
          ) : (
            <>
            <div className="space-y-2 lg:hidden">
              {rows.map((row) => {
                const overdue = row.status === "pending" && isHouseholdChargeOverdue(row);
                const achPayable = row.status === "pending" && canPayHouseholdChargeWithAxisAch(row);
                const showSelectCol = tab === "pending" && unpaidAchCharges.length > 0;
                const expanded = expandedId === row.id;
                const toggleExpand = () =>
                  setExpandedId((cur) => {
                    const next = cur === row.id ? null : row.id;
                    if (next !== cur && next) {
                      setCheckout(null);
                    }
                    return next;
                  });
                return (
                  <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
                    <div className="flex items-start gap-2.5">
                      {showSelectCol && achPayable ? (
                        <input
                          type="checkbox"
                          className="mt-1 size-4 shrink-0 rounded border-border"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelected(row.id)}
                          aria-label={`Select ${row.title}`}
                        />
                      ) : null}
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={toggleExpand}>
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{row.title}</p>
                            <p className="mt-0.5 truncate text-xs text-muted">{row.propertyLabel}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted/90">
                              Due {chargeDueLabel(row)} · {row.amountLabel}
                            </p>
                          </div>
                          <Badge tone={row.status === "paid" ? "approved" : overdue ? "overdue" : "pending"}>
                            {row.status === "paid" ? "Paid" : overdue ? "Overdue" : "Unpaid"}
                          </Badge>
                        </div>
                      </button>
                    </div>
                    {expanded ? (
                      <div className="mt-2.5 border-t border-border pt-2.5 text-sm text-muted">
                        {renderRowDetail(row)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
              <div className={PORTAL_DATA_TABLE_SCROLL}>
                <table className="sm:min-w-[720px] w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className={PORTAL_TABLE_HEAD_ROW}>
                      {tab === "pending" && unpaidAchCharges.length > 0 ? (
                        <th className={`${MANAGER_TABLE_TH} w-10 text-left`}>
                          <span className="sr-only">Select</span>
                        </th>
                      ) : null}
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Charge</th>
                      <th className={`${MANAGER_TABLE_TH} text-left hidden sm:table-cell`}>Property</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Due</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Amount</th>
                      <th className={`${MANAGER_TABLE_TH} text-left hidden sm:table-cell`}>Balance</th>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const overdue = row.status === "pending" && isHouseholdChargeOverdue(row);
                      const achPayable = row.status === "pending" && canPayHouseholdChargeWithAxisAch(row);
                      const showSelectCol = tab === "pending" && unpaidAchCharges.length > 0;
                      const detailColSpan = showSelectCol ? 7 : 6;
                      return (
                        <Fragment key={row.id}>
                          <tr
                            className={PORTAL_TABLE_TR_EXPANDABLE}
                            onClick={createPortalRowExpandClick(() =>
                              setExpandedId((cur) => {
                                const next = cur === row.id ? null : row.id;
                                if (next !== cur && next) {
                                  setCheckout(null);
                                }
                                return next;
                              }),
                            )}
                            aria-expanded={expandedId === row.id}
                          >
                            {showSelectCol ? (
                              <td className={PORTAL_TABLE_TD}>
                                {achPayable ? (
                                  <input
                                    type="checkbox"
                                    className="size-4 rounded border-border"
                                    checked={selectedIds.has(row.id)}
                                    onChange={() => toggleSelected(row.id)}
                                    aria-label={`Select ${row.title}`}
                                  />
                                ) : null}
                              </td>
                            ) : null}
                            <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.title}</td>
                            <td className={`${PORTAL_TABLE_TD} hidden sm:table-cell`}>{row.propertyLabel}</td>
                            <td className={PORTAL_TABLE_TD}>{chargeDueLabel(row)}</td>
                            <td className={`${PORTAL_TABLE_TD} tabular-nums text-foreground`}>{row.amountLabel}</td>
                            <td className={`${PORTAL_TABLE_TD} tabular-nums font-semibold text-foreground hidden sm:table-cell`}>
                              {row.balanceLabel}
                            </td>
                            <td className={PORTAL_TABLE_TD}>
                              <Badge tone={row.status === "paid" ? "approved" : overdue ? "overdue" : "pending"}>
                                {row.status === "paid" ? "Paid" : overdue ? "Overdue" : "Unpaid"}
                              </Badge>
                            </td>
                          </tr>
                          {expandedId === row.id ? (
                            <tr className={PORTAL_TABLE_DETAIL_ROW}>
                              <td colSpan={detailColSpan} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-muted`}>
                                {renderRowDetail(row)}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}
        </>
      )}
    </ManagerPortalPageShell>
      <Modal
        open={preferredMethodModalOpen}
        title="Set payment method"
        onClose={() => setPreferredMethodModalOpen(false)}
      >
        <div className="space-y-2">
          {acceptedMethods.map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => void savePreferredMethod(method)}
              disabled={preferredMethodSaving}
              className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                effectivePreferredMethod === method
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-primary/30"
              }`}
              data-attr={`resident-payment-method-option-${method}`}
            >
              <span className="text-sm font-semibold text-foreground">
                {RESIDENT_ACCEPTED_PAYMENT_METHOD_LABELS[method]}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
