"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  HOUSEHOLD_CHARGES_EVENT,
  linkHouseholdChargesToResidentUser,
  readChargesForResident,
  type HouseholdCharge,
} from "@/lib/household-charges";

type PayTab = "pending" | "paid";

function statusClass(label: string) {
  const l = label.toLowerCase();
  if (l.includes("paid")) return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80";
  return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
}

function centsFromLabel(label: string): number {
  const n = Number(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function ResidentPaymentsPanel() {
  const { showToast } = useAppUi();
  const [tab, setTab] = useState<PayTab>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const on = () => refresh();
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id || cancelled) return;
        const em = user.email?.trim() ?? null;
        setUserId(user.id);
        setEmail(em);
        if (em) linkHouseholdChargesToResidentUser(em, user.id);
        refresh();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const charges = useMemo(() => {
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
        { id: "pending" as const, label: "Pending", count: counts.pending },
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
            refresh();
            showToast("Refreshed payments.");
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
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            Pending balance: <span className="tabular-nums text-slate-950">${(pendingTotal / 100).toFixed(2)}</span>
          </div>
        </div>
      }
    >
      {!email ? (
        <p className="text-sm text-slate-600">Sign in to see your application fees, rent, and deposits.</p>
      ) : rows.length === 0 ? (
        <PortalDataTableEmpty
          message={
            charges.length === 0
              ? "No charges yet. Submit a rental application to see your listing’s application fee and deposit lines here."
              : tab === "pending"
                ? "Nothing pending — you’re all caught up in this tab."
                : "No paid items yet."
          }
        />
      ) : (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="min-w-[720px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Charge</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Amount</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Balance</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{row.title}</td>
                      <td className={PORTAL_TABLE_TD}>{row.propertyLabel}</td>
                      <td className={`${PORTAL_TABLE_TD} tabular-nums text-slate-800`}>{row.amountLabel}</td>
                      <td className={`${PORTAL_TABLE_TD} tabular-nums font-semibold text-slate-900`}>{row.balanceLabel}</td>
                      <td className={PORTAL_TABLE_TD}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(row.status === "paid" ? "Paid" : "Pending")}`}
                        >
                          {row.status === "paid" ? "Paid" : "Pending"}
                        </span>
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
                        <td colSpan={6} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-slate-600`}>
                          {row.zelleContactSnapshot ? (
                            <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/50 px-3 py-2.5 text-emerald-950">
                              <p className="text-xs font-semibold">Pay with Zelle</p>
                              <p className="mt-1 text-sm leading-relaxed">
                                Send to <span className="font-mono font-medium">{row.zelleContactSnapshot}</span>. Include your name and unit in
                                the memo. Your manager marks this paid when they receive it.
                              </p>
                            </div>
                          ) : (
                            <p className="leading-relaxed">
                              Stripe application-fee payments are marked paid automatically. Other charges are updated by your manager when they
                              receive payment.
                            </p>
                          )}
                          {row.status === "paid" && row.paidAt ? (
                            <p className="mt-2 text-xs text-slate-500">Marked paid {new Date(row.paidAt).toLocaleString()}</p>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ManagerPortalPageShell>
  );
}
