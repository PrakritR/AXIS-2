"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { StripeCheckoutModal } from "@/components/stripe-checkout-modal";
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
import { getPropertyById } from "@/lib/rental-application/data";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { axisAchFeeDisplayLabel, axisPaymentsEnabledOnListing } from "@/lib/payment-policy";
import { syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { safeFormatDateTime } from "@/lib/pacific-time";

type PayTab = "pending" | "paid";

function statusClass(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid")) return "approved" as const;
  return "pending" as const;
}

function centsFromLabel(label: string): number {
  const n = Number(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function canPayWithAxisAch(row: HouseholdCharge): boolean {
  if (row.status === "paid") return false;
  const prop = getPropertyById(row.propertyId);
  const sub = prop?.listingSubmission?.v === 1 ? normalizeManagerListingSubmissionV1(prop.listingSubmission) : null;
  return Boolean(sub && axisPaymentsEnabledOnListing(sub));
}

export function ResidentPaymentsPanel() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const router = useRouter();
  const session = usePortalSession();
  const [tab, setTab] = useState<PayTab>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
  const [checkoutBusyId, setCheckoutBusyId] = useState<string | null>(null);
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
        showToast("Payment received — thank you.");
      } else if (data.processing) {
        showToast("Bank transfer submitted. We will mark this paid when the transfer clears (usually 3–5 business days).");
      } else {
        showToast(typeof data.error === "string" ? data.error : "Payment not completed yet.");
      }
      router.replace("/resident/payments");
    })();
  }, [refresh, router, searchParams, showToast]);

  const startAchCheckout = async (chargeId: string) => {
    setCheckoutBusyId(chargeId);
    try {
      const res = await fetch("/api/stripe/household-charge-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chargeId, embedded: true }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        clientSecret?: string;
        url?: string;
        error?: string;
      };
      if (!res.ok) {
        showToast(typeof payload.error === "string" ? payload.error : "Could not start bank payment.");
        return;
      }
      if (payload.clientSecret) {
        setCheckoutSecret(payload.clientSecret);
        return;
      }
      if (payload.url && typeof window !== "undefined") {
        window.location.href = payload.url;
      }
    } finally {
      setCheckoutBusyId(null);
    }
  };

  const charges = useMemo(() => {
    void tick;
    if (!email) return [] as HouseholdCharge[];
    return readChargesForResident(email, userId);
  }, [email, userId, tick]);

  const rows = useMemo(() => charges.filter((c) => (tab === "pending" ? c.status === "pending" : c.status === "paid")), [charges, tab]);
  const pendingTotal = useMemo(
    () =>
      charges
        .filter((c) => c.status === "pending")
        .reduce((sum, c) => sum + centsFromLabel(c.balanceLabel), 0),
    [charges],
  );

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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <ManagerPortalStatusPills
            tabs={[...tabs]}
            activeId={tab}
            onChange={(id) => setTab(id as PayTab)}
          />
          <div className="glass-card rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted">
            Unpaid balance: <span className="tabular-nums text-foreground">${(pendingTotal / 100).toFixed(2)}</span>
          </div>
        </div>
      }
    >
      {!email ? (
        <p className="text-sm text-muted">Sign in to see your application fees, rent, and deposits.</p>
      ) : rows.length === 0 ? (
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
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.title}</td>
                      <td className={`${PORTAL_TABLE_TD} hidden sm:table-cell`}>{row.propertyLabel}</td>
                      <td className={PORTAL_TABLE_TD}>{chargeDueLabel(row)}</td>
                      <td className={`${PORTAL_TABLE_TD} tabular-nums text-foreground`}>{row.amountLabel}</td>
                      <td className={`${PORTAL_TABLE_TD} tabular-nums font-semibold text-foreground hidden sm:table-cell`}>{row.balanceLabel}</td>
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
                          onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                        >
                          {expandedId === row.id ? "Hide" : "Details"}
                        </Button>
                      </td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={7} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-muted`}>
                          <p className="mb-3 text-sm text-muted">
                            Due: <span className="font-semibold text-foreground">{chargeDueLabel(row)}</span>
                          </p>
                          {row.zelleContactSnapshot ? (
                            <div className="glass-card rounded-lg px-3 py-2.5 text-[var(--status-confirmed-fg)]">
                              <p className="text-xs font-semibold">Pay with Zelle</p>
                              <p className="mt-1 text-sm leading-relaxed">
                                Send to <span className="font-mono font-medium">{row.zelleContactSnapshot}</span>. Include your name and unit in
                                the memo. Your manager marks this paid when they receive it.
                              </p>
                            </div>
                          ) : row.venmoContactSnapshot ? (
                            <div className="glass-card rounded-lg px-3 py-2.5 text-[var(--status-approved-fg)]">
                              <p className="text-xs font-semibold">Pay with Venmo</p>
                              <p className="mt-1 text-sm leading-relaxed">
                                Send to <span className="font-mono font-medium">{row.venmoContactSnapshot}</span>. Include your name and unit in
                                the note. Your manager marks this paid when they receive it.
                              </p>
                            </div>
                          ) : (() => {
                            const prop = getPropertyById(row.propertyId);
                            const sub =
                              prop?.listingSubmission?.v === 1
                                ? normalizeManagerListingSubmissionV1(prop.listingSubmission)
                                : null;
                            if (sub && axisPaymentsEnabledOnListing(sub)) {
                              return (
                                <div className="glass-card rounded-lg px-3 py-2.5 text-[var(--status-approved-fg)]">
                                  <p className="text-xs font-semibold">Pay with Axis (ACH)</p>
                                  <p className="mt-1 text-sm leading-relaxed">
                                    Pay by bank transfer securely through Stripe — {axisAchFeeDisplayLabel()}. Transfers
                                    typically clear in 3–5 business days.
                                  </p>
                                </div>
                              );
                            }
                            return (
                              <p className="leading-relaxed">
                                All charges are updated by your manager when they receive payment via Zelle, Venmo, ACH, or cash.
                              </p>
                            );
                          })()}
                          {row.status === "paid" && row.paidAt ? (
                            <p className="mt-2 text-xs text-slate-500">Marked paid {safeFormatDateTime(row.paidAt)}</p>
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
                            {row.status === "pending" && canPayWithAxisAch(row) ? (
                              <Button
                                type="button"
                                variant="primary"
                                className={PORTAL_DETAIL_BTN}
                                disabled={checkoutBusyId === row.id}
                                onClick={() => void startAchCheckout(row.id)}
                              >
                                {checkoutBusyId === row.id ? "Opening…" : "Pay with bank (ACH)"}
                              </Button>
                            ) : null}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {checkoutSecret ? (
        <StripeCheckoutModal
          clientSecret={checkoutSecret}
          onClose={() => {
            setCheckoutSecret(null);
            void syncHouseholdChargesFromServer(true, { skipReconcile: true }).then(refresh);
          }}
        />
      ) : null}
    </ManagerPortalPageShell>
  );
}
