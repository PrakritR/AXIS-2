"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_DETAIL_BTN_PRIMARY,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import { demoManagerWorkOrderRowsFull } from "@/data/demo-portal";
import {
  findPendingWorkOrderCharge,
  HOUSEHOLD_CHARGES_EVENT,
  parseMoneyAmount,
  recordWorkOrderResidentCharge,
} from "@/lib/household-charges";
import { useManagerUserId } from "@/hooks/use-manager-user-id";

function priorityClass(p: string) {
  const x = p.toLowerCase();
  if (x === "high") return "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80";
  if (x === "medium") return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80";
}

type BillDraft = { cost: string; email: string; name: string };

function defaultBillDraft(row: DemoManagerWorkOrderRow): BillDraft {
  const cost = row.cost !== "—" && row.cost.trim() ? row.cost : "";
  return { cost, email: row.residentEmail ?? "", name: row.residentName ?? "" };
}

export function ManagerWorkOrdersPanel({ bucket }: { bucket: ManagerWorkOrderBucket }) {
  const { showToast } = useAppUi();
  const { userId: managerUserId, ready: authReady } = useManagerUserId();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [billDraftById, setBillDraftById] = useState<Record<string, BillDraft>>({});
  const [hcTick, setHcTick] = useState(0);

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  const rows = useMemo(() => demoManagerWorkOrderRowsFull.filter((r) => r.bucket === bucket), [bucket]);

  const pendingByWoId = useMemo(() => {
    const m = new Map<string, ReturnType<typeof findPendingWorkOrderCharge>>();
    for (const r of rows) {
      const c = findPendingWorkOrderCharge(r.id);
      if (c) m.set(r.id, c);
    }
    return m;
  }, [rows, hcTick]);

  if (rows.length === 0) {
    return (
      <PortalDataTableEmpty
        message={
          demoManagerWorkOrderRowsFull.length === 0 ? "No work orders yet (demo)." : "No work orders in this bucket (demo)."
        }
      />
    );
  }

  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <div className={PORTAL_DATA_TABLE_SCROLL}>
        <table className="min-w-[720px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              <th className={`${MANAGER_TABLE_TH} text-left`}>ID</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Unit</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Priority</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
              <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = billDraftById[row.id] ?? defaultBillDraft(row);
              const pendingCharge = pendingByWoId.get(row.id);

              return (
                <Fragment key={row.id}>
                  <tr className={PORTAL_TABLE_TR}>
                    <td className={`${PORTAL_TABLE_TD} font-mono text-xs text-slate-800`}>{row.id}</td>
                    <td className={PORTAL_TABLE_TD}>{row.propertyName}</td>
                    <td className={PORTAL_TABLE_TD}>{row.unit}</td>
                    <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{row.title}</td>
                    <td className={PORTAL_TABLE_TD}>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}>
                        {row.priority}
                      </span>
                    </td>
                    <td className={PORTAL_TABLE_TD}>{row.status}</td>
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
                      <td colSpan={7} className={PORTAL_TABLE_DETAIL_CELL}>
                        <p className="text-sm leading-relaxed text-slate-600">{row.description}</p>
                        <p className="mt-1.5 text-xs text-slate-500">
                          Scheduled <span className="text-slate-700">{row.scheduled}</span>
                          {row.cost !== "—" ? (
                            <>
                              {" "}
                              · Logged cost <span className="text-slate-700">{row.cost}</span>
                            </>
                          ) : null}
                        </p>

                        <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-3">
                          <p className="text-xs font-medium text-slate-800">Bill resident</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                            Pass-through cost creates a pending line on Payments for you and the resident.
                          </p>
                          {pendingCharge ? (
                            <p className="mt-2 rounded-md bg-emerald-50/90 px-2.5 py-1.5 text-[11px] text-emerald-900 ring-1 ring-emerald-200/70">
                              Pending: <span className="font-semibold">{pendingCharge.balanceLabel}</span> ·{" "}
                              <span className="font-medium">{pendingCharge.residentEmail}</span>. Mark paid in Payments before adding another.
                            </p>
                          ) : null}
                          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                            <div>
                              <p className="mb-1 text-[11px] font-medium text-slate-600">Cost</p>
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="e.g. 75 or $75"
                                value={draft.cost}
                                onChange={(e) =>
                                  setBillDraftById((prev) => ({
                                    ...prev,
                                    [row.id]: { ...(prev[row.id] ?? defaultBillDraft(row)), cost: e.target.value },
                                  }))
                                }
                                className="h-8 rounded-md text-sm"
                                disabled={!!pendingCharge}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <p className="mb-1 text-[11px] font-medium text-slate-600">Resident email</p>
                              <Input
                                type="email"
                                autoComplete="email"
                                placeholder="resident@email.com"
                                value={draft.email}
                                onChange={(e) =>
                                  setBillDraftById((prev) => ({
                                    ...prev,
                                    [row.id]: { ...(prev[row.id] ?? defaultBillDraft(row)), email: e.target.value },
                                  }))
                                }
                                className="h-8 rounded-md text-sm"
                                disabled={!!pendingCharge}
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <p className="mb-1 text-[11px] font-medium text-slate-600">Resident name (optional)</p>
                              <Input
                                type="text"
                                autoComplete="name"
                                placeholder="Shown on the payment line"
                                value={draft.name}
                                onChange={(e) =>
                                  setBillDraftById((prev) => ({
                                    ...prev,
                                    [row.id]: { ...(prev[row.id] ?? defaultBillDraft(row)), name: e.target.value },
                                  }))
                                }
                                className="h-8 rounded-md text-sm"
                                disabled={!!pendingCharge}
                              />
                            </div>
                          </div>
                          <div className="mt-3">
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN_PRIMARY}
                              disabled={!!pendingCharge || !authReady || !managerUserId}
                              onClick={() => {
                                if (!managerUserId) {
                                  showToast("Sign in as a manager to create a pending payment.");
                                  return;
                                }
                                if (parseMoneyAmount(draft.cost) <= 0) {
                                  showToast("Enter a cost greater than zero.");
                                  return;
                                }
                                const email = draft.email.trim().toLowerCase();
                                if (!email || !email.includes("@")) {
                                  showToast("Enter a valid resident email.");
                                  return;
                                }
                                if (findPendingWorkOrderCharge(row.id)) {
                                  showToast("A pending payment already exists for this work order.");
                                  return;
                                }
                                const created = recordWorkOrderResidentCharge({
                                  managerUserId,
                                  workOrderId: row.id,
                                  propertyLabel: row.propertyName,
                                  unit: row.unit,
                                  workOrderTitle: row.title,
                                  amountInput: draft.cost,
                                  residentEmail: draft.email,
                                  residentName: draft.name,
                                });
                                if (created) {
                                  showToast("Pending payment created. It appears under Payments for you and the resident.");
                                }
                              }}
                            >
                              Create pending payment
                            </Button>
                          </div>
                          {!managerUserId && authReady ? (
                            <p className="mt-2 text-[11px] text-amber-800">Sign in as a manager to record charges.</p>
                          ) : null}
                        </div>

                        <PortalTableDetailActions>
                          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => showToast("Visit scheduled (demo).")}>
                            Schedule visit
                          </Button>
                          <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => showToast("Marked complete (demo).")}>
                            Mark complete
                          </Button>
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
  );
}
