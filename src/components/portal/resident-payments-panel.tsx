"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { StripeEmbeddedCheckout } from "@/components/stripe-embedded-checkout";
import { MANAGER_TABLE_TH, ManagerPortalPageShell, ManagerPortalStatusPills } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  chargeDueLabel,
  HOUSEHOLD_CHARGES_EVENT,
  HOUSEHOLD_CHARGES_SESSION_KEY,
  linkHouseholdChargesToResidentUser,
  readChargesForResident,
  syncHouseholdChargesFromServer,
  type HouseholdCharge,
} from "@/lib/household-charges";
import { syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import { canPayHouseholdChargeWithAxisAch } from "@/lib/household-charge-payment-eligibility";
import {
  residentPaymentMethodLabel,
  residentProcessingFeeDisplayLabel,
  type ResidentAxisPaymentMethod,
} from "@/lib/payment-policy";
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

function statusClass(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid")) return "approved" as const;
  return "pending" as const;
}

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
  const [tab, setTab] = useState<PayTab>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [paymentMethod, setPaymentMethod] = useState<ResidentAxisPaymentMethod>("ach");
  const [tick, setTick] = useState(0);
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const email = session.email?.trim() ?? null;
  const userId = session.userId;

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

  const rows = useMemo(() => charges.filter((c) => (tab === "pending" ? c.status === "pending" : c.status === "paid")), [charges, tab]);
  const pendingTotal = useMemo(
    () =>
      charges
        .filter((c) => c.status === "pending")
        .reduce((sum, c) => sum + centsFromLabel(c.balanceLabel), 0),
    [charges],
  );

  const selectedTotal = useMemo(() => {
    let total = 0;
    for (const id of selectedIds) {
      const charge = charges.find((c) => c.id === id);
      if (charge) total += centsFromLabel(charge.balanceLabel);
    }
    return total;
  }, [charges, selectedIds]);

  const counts = useMemo(() => {
    return {
      pending: charges.filter((c) => c.status === "pending").length,
      paid: charges.filter((c) => c.status === "paid").length,
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
      const key = checkoutKey(ids, method);
      setCheckout({ key, chargeIds: ids, paymentMethod: method, clientSecret: null, loading: true, error: null });
      try {
        const res = await fetch("/api/stripe/household-charge-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    [],
  );

  useEffect(() => {
    if (!expandedId) return;
    const row = charges.find((c) => c.id === expandedId);
    if (!row || row.status !== "pending" || !canPayHouseholdChargeWithAxisAch(row)) {
      return;
    }
    const ids =
      selectedIds.has(expandedId) && selectedIds.size > 1 ? [...selectedIds] : [expandedId];
    const key = checkoutKey(ids, paymentMethod);
    if (checkout?.key === key && (checkout.loading || checkout.clientSecret || checkout.error)) return;
    // Defer the load a tick (matches the load-in-effect idiom used elsewhere) so
    // the trigger isn't a synchronous setState. The key guard above prevents
    // duplicate intent loads, and the cleanup cancels a superseded load.
    const id = window.setTimeout(() => void loadCheckout(ids, paymentMethod), 0);
    return () => window.clearTimeout(id);
  }, [
    charges,
    checkout?.key,
    checkout?.clientSecret,
    checkout?.error,
    checkout?.loading,
    expandedId,
    loadCheckout,
    paymentMethod,
    selectedIds,
  ]);

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

  const showCheckoutInExpandedRow = Boolean(
    checkout && expandedId && checkout.chargeIds.includes(expandedId),
  );
  const showBulkCheckoutBar = Boolean(
    checkout && checkout.chargeIds.length > 1 && !showCheckoutInExpandedRow,
  );

  const renderPaymentMethodPicker = () => (
    <div className="grid gap-2 sm:grid-cols-3">
      {PAYMENT_METHOD_OPTIONS.map((option) => {
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
          <p className="rounded-xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-sm text-rose-900">{checkout.error}</p>
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

  return (
    <ManagerPortalPageShell
      title="Payments"
      titleAside={
        <Button
          type="button"
          variant="outline"
          className="shrink-0 rounded-full"
          onClick={() => {
            void (async () => {
              await syncManagerApplicationsFromServer({ force: true });
              await syncPropertyPipelineFromServer({ force: true });
              await syncHouseholdChargesFromServer(true, { skipReconcile: true });
            })().then(() => {
              refresh();
              showToast("Refreshed payments.");
            });
          }}
        >
          Refresh
        </Button>
      }
      filterRow={
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <ManagerPortalStatusPills
              tabs={[...tabs]}
              activeId={tab}
              onChange={(id) => {
                setTab(id as PayTab);
                setExpandedId(null);
                setCheckout(null);
              }}
            />
            <div className="glass-card rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted">
              Unpaid balance: <span className="tabular-nums text-foreground">${(pendingTotal / 100).toFixed(2)}</span>
            </div>
          </div>
          {tab === "pending" && unpaidAchCharges.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="rounded-full text-xs" onClick={selectAllUnpaidAch}>
                Select all bank-payable
              </Button>
              {selectedIds.size > 0 ? (
                <Button
                  type="button"
                  variant="primary"
                  className="rounded-full text-xs"
                  onClick={() => {
                    setExpandedId(null);
                    void loadCheckout([...selectedIds], paymentMethod);
                  }}
                >
                  Pay {selectedIds.size} selected ({formatUsd(selectedTotal)})
                </Button>
              ) : null}
              {unpaidAchCharges.length > 1 ? (
                <Button
                  type="button"
                  variant="primary"
                  className="rounded-full text-xs"
                  onClick={() => {
                    const ids = unpaidAchCharges.map((c) => c.id);
                    setSelectedIds(new Set(ids));
                    setExpandedId(null);
                    void loadCheckout(ids, paymentMethod);
                  }}
                >
                  Pay all unpaid (
                  {formatUsd(unpaidAchCharges.reduce((sum, c) => sum + centsFromLabel(c.balanceLabel), 0))})
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
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
              message={
                charges.length === 0
                  ? "No charges yet. Submit a rental application to see your listing’s application fee and deposit lines here."
                  : tab === "pending"
                    ? "Nothing unpaid — you’re all caught up in this tab."
                    : "No paid items yet."
              }
            />
          ) : (
            <div className={PORTAL_DATA_TABLE_WRAP}>
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
                      <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const achPayable = row.status === "pending" && canPayHouseholdChargeWithAxisAch(row);
                      const showSelectCol = tab === "pending" && unpaidAchCharges.length > 0;
                      const detailColSpan = showSelectCol ? 8 : 7;
                      return (
                        <Fragment key={row.id}>
                          <tr className={PORTAL_TABLE_TR}>
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
                              <Badge tone={statusClass(row.status === "paid" ? "Paid" : "Unpaid")}>
                                {row.status === "paid" ? "Paid" : "Unpaid"}
                              </Badge>
                            </td>
                            <td className={`${PORTAL_TABLE_TD} text-right`}>
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                                onClick={() =>
                                  setExpandedId((cur) => {
                                    const next = cur === row.id ? null : row.id;
                                    if (next !== cur && next) {
                                      setCheckout(null);
                                    }
                                    return next;
                                  })
                                }
                              >
                                {expandedId === row.id ? "Hide" : "Details"}
                              </Button>
                            </td>
                          </tr>
                          {expandedId === row.id ? (
                            <tr className={PORTAL_TABLE_DETAIL_ROW}>
                              <td colSpan={detailColSpan} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-muted`}>
                                <p className="mb-3 text-sm text-muted">
                                  Due: <span className="font-semibold text-foreground">{chargeDueLabel(row)}</span>
                                </p>
                                {row.zelleContactSnapshot ? (
                                  <div className="glass-card mb-4 rounded-lg px-3 py-2.5 text-[var(--status-confirmed-fg)]">
                                    <p className="text-xs font-semibold">Pay with Zelle</p>
                                    <p className="mt-1 text-sm leading-relaxed">
                                      Send to <span className="font-mono font-medium">{row.zelleContactSnapshot}</span>. Include your name and unit in
                                      the memo. Your manager marks this paid when they receive it.
                                    </p>
                                  </div>
                                ) : row.venmoContactSnapshot ? (
                                  <div className="glass-card mb-4 rounded-lg px-3 py-2.5 text-[var(--status-approved-fg)]">
                                    <p className="text-xs font-semibold">Pay with Venmo</p>
                                    <p className="mt-1 text-sm leading-relaxed">
                                      Send to <span className="font-mono font-medium">{row.venmoContactSnapshot}</span>. Include your name and unit in
                                      the note. Your manager marks this paid when they receive it.
                                    </p>
                                  </div>
                                ) : null}
                                {achPayable ? (
                                  <div className="mb-4">
                                    {renderCheckoutBlock(
                                      checkout && checkout.chargeIds.length > 1 && checkout.chargeIds.includes(row.id)
                                        ? `Pay ${checkout.chargeIds.length} selected charges`
                                        : `Pay online (${residentPaymentMethodLabel(checkout?.paymentMethod ?? paymentMethod)})`,
                                    )}
                                  </div>
                                ) : !row.zelleContactSnapshot && !row.venmoContactSnapshot ? (
                                  <p className="mb-4 leading-relaxed">
                                    All charges are updated by your manager when they receive payment via Zelle, Venmo, ACH, or cash.
                                  </p>
                                ) : null}
                                {row.status === "paid" && row.paidAt ? (
                                  <p className="mt-2 text-xs text-muted">Marked paid {safeFormatDateTime(row.paidAt)}</p>
                                ) : null}
                                {row.blocksLeaseUntilPaid && row.status === "pending" ? (
                                  <p className="mt-3 text-sm text-amber-900">
                                    Pay this before signing your lease.{" "}
                                    <Link href="/resident/lease" className="font-semibold text-primary underline underline-offset-2">
                                      Open lease tab
                                    </Link>
                                    .
                                  </p>
                                ) : null}
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
          )}
        </>
      )}
    </ManagerPortalPageShell>
  );
}
