"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
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
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import {
  findPendingWorkOrderCharge,
  HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE,
  HOUSEHOLD_CHARGES_EVENT,
  parseMoneyAmount,
  recordWorkOrderResidentCharge,
} from "@/lib/household-charges";
import { deleteManagerWorkOrderRow, updateManagerWorkOrder } from "@/lib/manager-work-orders-storage";
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fromDatetimeLocalValue(s: string): string | null {
  if (!s.trim()) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatScheduledLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ManagerWorkOrdersPanel({
  allRows,
  bucket,
  onAfterSchedule,
}: {
  allRows: DemoManagerWorkOrderRow[];
  bucket: ManagerWorkOrderBucket;
  /** After moving a row from Open → Scheduled, switch the parent tab so the row is still visible. */
  onAfterSchedule?: () => void;
}) {
  const { showToast } = useAppUi();
  const { userId: managerUserId, ready: authReady } = useManagerUserId();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [billDraftById, setBillDraftById] = useState<Record<string, BillDraft>>({});
  const [visitAtById, setVisitAtById] = useState<Record<string, string>>({});
  const [hcTick, setHcTick] = useState(0);

  const rows = useMemo(() => allRows.filter((r) => r.bucket === bucket), [allRows, bucket]);

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  const openExpand = useCallback(
    (row: DemoManagerWorkOrderRow) => {
      setExpandedId(row.id);
      setVisitAtById((prev) => ({
        ...prev,
        [row.id]: row.scheduledAtIso ? toDatetimeLocalValue(row.scheduledAtIso) : prev[row.id] ?? "",
      }));
      setBillDraftById((prev) => ({
        ...prev,
        [row.id]: prev[row.id] ?? defaultBillDraft(row),
      }));
    },
    [],
  );

  const effectiveManagerId = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;

  const tryAutoChargeScheduled = useCallback(() => {
    if (!authReady) return;
    for (const row of allRows) {
      if (row.bucket !== "scheduled") continue;
      if (findPendingWorkOrderCharge(row.id)) continue;
      const draft = billDraftById[row.id] ?? defaultBillDraft(row);
      const amountInput = draft.cost.trim() ? draft.cost : row.cost;
      const amt = parseMoneyAmount(amountInput);
      const email = (draft.email || row.residentEmail || "").trim().toLowerCase();
      if (amt <= 0 || !email.includes("@")) continue;
      const created = recordWorkOrderResidentCharge({
        managerUserId: effectiveManagerId,
        workOrderId: row.id,
        propertyLabel: row.propertyName,
        unit: row.unit,
        workOrderTitle: row.title,
        amountInput,
        residentEmail: draft.email.trim() || (row.residentEmail ?? ""),
        residentName: draft.name.trim() || row.residentName || "",
      });
      if (created) {
        setHcTick((n) => n + 1);
      }
    }
  }, [allRows, authReady, billDraftById, effectiveManagerId]);

  useEffect(() => {
    const t = window.setTimeout(() => tryAutoChargeScheduled(), 400);
    return () => window.clearTimeout(t);
  }, [tryAutoChargeScheduled, hcTick]);

  const pendingByWoId = useMemo(() => {
    void hcTick;
    const m = new Map<string, ReturnType<typeof findPendingWorkOrderCharge>>();
    for (const r of rows) {
      const c = findPendingWorkOrderCharge(r.id);
      if (c) m.set(r.id, c);
    }
    return m;
  }, [rows, hcTick]);

  const saveScheduleFromOpen = (row: DemoManagerWorkOrderRow) => {
    const visitAt = visitAtById[row.id] ?? "";
    const iso = fromDatetimeLocalValue(visitAt);
    const draft = billDraftById[row.id] ?? defaultBillDraft(row);
    const amt = parseMoneyAmount(draft.cost);
    const email = draft.email.trim().toLowerCase();
    if (!iso) {
      showToast("Choose a visit date and time to schedule.");
      return;
    }
    if (!Number.isFinite(amt) || amt < 0) {
      showToast("Enter a valid cost (0 or more) to schedule this work order.");
      return;
    }
    if (!email || !email.includes("@")) {
      showToast("Enter the resident email for billing.");
      return;
    }
    const costLabel = `$${amt.toFixed(2)}`;
    updateManagerWorkOrder(row.id, (r) => ({
      ...r,
      bucket: "scheduled",
      status: "Scheduled",
      scheduledAtIso: iso,
      scheduled: formatScheduledLabel(iso),
      cost: costLabel,
      residentEmail: draft.email.trim(),
      residentName: draft.name.trim() || r.residentName,
    }));
    const created = recordWorkOrderResidentCharge({
      managerUserId: effectiveManagerId,
      workOrderId: row.id,
      propertyLabel: row.propertyName,
      unit: row.unit,
      workOrderTitle: row.title,
      amountInput: draft.cost,
      residentEmail: draft.email,
      residentName: draft.name,
    });
    if (created) setHcTick((n) => n + 1);
    showToast(
      created
        ? "Work order scheduled and pending payment created for the resident."
        : "Work order scheduled. Add a valid cost and email to create the pending payment.",
    );
    setExpandedId(null);
    onAfterSchedule?.();
  };

  const rescheduleVisit = (row: DemoManagerWorkOrderRow) => {
    const visitAt = visitAtById[row.id] ?? "";
    const iso = fromDatetimeLocalValue(visitAt);
    if (!iso) {
      showToast("Choose a new visit date and time.");
      return;
    }
    updateManagerWorkOrder(row.id, (r) => ({
      ...r,
      scheduledAtIso: iso,
      scheduled: formatScheduledLabel(iso),
    }));
    showToast("Visit time updated.");
  };

  const markComplete = (row: DemoManagerWorkOrderRow) => {
    if (row.bucket !== "scheduled") return;
    updateManagerWorkOrder(row.id, (r) => ({
      ...r,
      bucket: "completed",
      status: "Completed",
    }));
    showToast("Marked complete.");
    setExpandedId(null);
  };

  /** Persist an estimated or pass-through cost without changing bucket (visible to the resident). */
  const saveLoggedCost = (row: DemoManagerWorkOrderRow, pendingCharge: ReturnType<typeof findPendingWorkOrderCharge>) => {
    if (pendingCharge) {
      showToast("Cost is locked while a pending payment exists.");
      return;
    }
    const draft = billDraftById[row.id] ?? defaultBillDraft(row);
    const trimmed = draft.cost.trim();
    if (!trimmed) {
      updateManagerWorkOrder(row.id, (r) => ({ ...r, cost: "—" }));
      showToast("Cost cleared.");
      return;
    }
    const amt = parseMoneyAmount(trimmed);
    if (!Number.isFinite(amt) || amt < 0) {
      showToast("Enter a valid dollar amount (0 or more) or clear the field.");
      return;
    }
    const costLabel = `$${amt.toFixed(2)}`;
    updateManagerWorkOrder(row.id, (r) => ({ ...r, cost: costLabel }));
    showToast("Cost saved — the resident will see it on their work order.");
  };

  const onDeleteWorkOrder = (row: DemoManagerWorkOrderRow) => {
    if (!window.confirm(`Delete work order ${row.id} (${row.title})? This cannot be undone.`)) return;
    if (deleteManagerWorkOrderRow(row.id)) {
      showToast("Work order removed.");
      setExpandedId(null);
      setHcTick((n) => n + 1);
    } else showToast("Could not delete work order.");
  };

  if (rows.length === 0) {
    return (
      <PortalDataTableEmpty
        message={allRows.length === 0 ? "No work orders yet." : "No work orders in this bucket."}
      />
    );
  }

  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <div className={PORTAL_DATA_TABLE_SCROLL}>
        <table className="min-w-[780px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              <th className={`${MANAGER_TABLE_TH} text-left`}>ID</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Unit</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Priority</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Cost</th>
              <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = billDraftById[row.id] ?? defaultBillDraft(row);
              const pendingCharge = pendingByWoId.get(row.id);
              const visitAt = visitAtById[row.id] ?? "";

              return (
                <Fragment key={row.id}>
                  <tr className={PORTAL_TABLE_TR}>
                    <td className={`${PORTAL_TABLE_TD} font-mono text-xs text-slate-800`}>{row.id}</td>
                    <td className={PORTAL_TABLE_TD}>{row.propertyName}</td>
                    <td className={PORTAL_TABLE_TD}>{row.unit}</td>
                    <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{row.title}</td>
                    <td className={PORTAL_TABLE_TD}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}
                      >
                        {row.priority}
                      </span>
                    </td>
                    <td className={PORTAL_TABLE_TD}>{row.status}</td>
                    <td className={PORTAL_TABLE_TD}>{row.cost !== "—" && row.cost.trim() ? row.cost : "—"}</td>
                    <td className={`${PORTAL_TABLE_TD} text-right`}>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                          onClick={() => (expandedId === row.id ? setExpandedId(null) : openExpand(row))}
                        >
                          {expandedId === row.id ? "Hide" : "Details"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className={`${PORTAL_TABLE_ROW_TOGGLE_CLASS} border-rose-200 text-rose-800 hover:bg-rose-50`}
                          onClick={() => onDeleteWorkOrder(row)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === row.id ? (
                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                      <td colSpan={8} className={PORTAL_TABLE_DETAIL_CELL}>
                        <p className="text-sm leading-relaxed text-slate-600">{row.description}</p>
                        <p className="mt-1.5 text-xs text-slate-500">
                          Resident preferred arrival:{" "}
                          <span className="font-medium text-slate-700">{row.preferredArrival?.trim() || "Anytime"}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.bucket === "open" ? (
                            <span>
                              Visit: <span className="text-slate-700">not scheduled</span>
                              {row.cost !== "—" ? (
                                <>
                                  {" "}
                                  · Logged cost <span className="text-slate-700">{row.cost}</span>
                                </>
                              ) : null}
                            </span>
                          ) : (
                            <span>
                              Scheduled <span className="text-slate-700">{row.scheduled}</span>
                              {row.cost !== "—" ? (
                                <>
                                  {" "}
                                  · Logged cost <span className="text-slate-700">{row.cost}</span>
                                </>
                              ) : null}
                            </span>
                          )}
                        </p>

                        {row.bucket !== "completed" ? (
                          <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-3">
                            <p className="text-xs font-medium text-slate-800">Visit</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                              {row.bucket === "open"
                                ? "Pick a date and time, enter pass-through cost and resident email, then schedule. The work order stays Open until all are set."
                                : "Adjust the visit time without changing billing. Use Payments to mark the resident line paid."}
                            </p>
                            <div className="mt-2 max-w-md">
                              <p className="mb-1 text-[11px] font-medium text-slate-600">Visit date &amp; time</p>
                              <Input
                                type="datetime-local"
                                value={visitAt}
                                onChange={(e) =>
                                  setVisitAtById((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.value,
                                  }))
                                }
                                className="h-9 rounded-md text-sm"
                              />
                            </div>
                          </div>
                        ) : null}

                        {row.bucket !== "completed" ? (
                          <div className="mt-4 rounded-lg border border-slate-200/60 bg-white p-3">
                            <p className="text-xs font-medium text-slate-800">Bill resident</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                              Pass-through cost creates a pending line on Payments for you and the resident. When cost and
                              email are valid on a scheduled work order, a pending charge is created automatically.
                            </p>
                            {pendingCharge ? (
                              <p className="mt-2 rounded-md bg-emerald-50/90 px-2.5 py-1.5 text-[11px] text-emerald-900 ring-1 ring-emerald-200/70">
                                Pending: <span className="font-semibold">{pendingCharge.balanceLabel}</span> ·{" "}
                                <span className="font-medium">{pendingCharge.residentEmail}</span>. Mark paid in Payments
                                before changing the amount.
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
                          </div>
                        ) : null}

                        {row.bucket === "completed" ? (
                          <p className="mt-3 text-xs text-slate-500">This work order is completed. Billing history stays in Payments.</p>
                        ) : null}

                        <PortalTableDetailActions>
                          {row.bucket === "open" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => saveLoggedCost(row, pendingCharge)}
                            >
                              Save cost
                            </Button>
                          ) : null}
                          {row.bucket === "scheduled" && !pendingCharge ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => saveLoggedCost(row, pendingCharge)}
                            >
                              Save cost
                            </Button>
                          ) : null}
                          {row.bucket === "open" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => saveScheduleFromOpen(row)}
                            >
                              Schedule visit
                            </Button>
                          ) : null}
                          {row.bucket === "scheduled" ? (
                            <>
                              <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => rescheduleVisit(row)}>
                                Save new visit time
                              </Button>
                              <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => markComplete(row)}>
                                Mark complete
                              </Button>
                            </>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-rose-50`}
                            onClick={() => onDeleteWorkOrder(row)}
                          >
                            Delete work order
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
