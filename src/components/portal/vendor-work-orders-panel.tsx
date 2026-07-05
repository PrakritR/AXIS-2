"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagerPortalPageShell, MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_DETAIL_BTN,
  PortalTableDetailActions,
  PortalDataTableEmpty,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { WorkOrderStatusBadge } from "@/components/portal/resident-services-panel";
import { readVendorWorkOrderRows, syncManagerWorkOrdersFromServer, MANAGER_WORK_ORDERS_EVENT } from "@/lib/manager-work-orders-storage";
import { parseMoneyAmount } from "@/lib/household-charges";
import { fetchWorkOrderBids, type WorkOrderBid } from "@/lib/work-order-bids";
import { useAppUi } from "@/components/providers/app-ui-provider";

function propertyLabel(row: DemoManagerWorkOrderRow): string {
  const unit = row.unit?.trim();
  return unit && unit !== "—" ? `${row.propertyName} · ${unit}` : row.propertyName;
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

type BidDraft = { amount: string; proposedTime: string; note: string };

function defaultBidDraft(bid: WorkOrderBid | undefined): BidDraft {
  return {
    amount: bid ? (bid.amountCents / 100).toFixed(2) : "",
    proposedTime: bid ? toDatetimeLocalValue(bid.proposedTime) : "",
    note: bid?.note ?? "",
  };
}

/** Work orders offered/assigned to the signed-in vendor. Read-only except for submitting a
 * cost/time bid once the manager has opened a work order for bids. */
export function VendorWorkOrdersPanel() {
  const { showToast } = useAppUi();
  const [rows, setRows] = useState<DemoManagerWorkOrderRow[]>(() => readVendorWorkOrderRows());
  const [bidsByWorkOrderId, setBidsByWorkOrderId] = useState<Record<string, WorkOrderBid>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftById, setDraftById] = useState<Record<string, BidDraft>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [doneNoteById, setDoneNoteById] = useState<Record<string, string>>({});
  const [markingDoneId, setMarkingDoneId] = useState<string | null>(null);

  const loadBids = useCallback(async () => {
    const bids = await fetchWorkOrderBids();
    setBidsByWorkOrderId(Object.fromEntries(bids.map((b) => [b.workOrderId, b])));
  }, []);

  useEffect(() => {
    const sync = () => setRows(readVendorWorkOrderRows());
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    void syncManagerWorkOrdersFromServer().then(() => sync());
    void loadBids();
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
  }, [loadBids]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.scheduledAtIso ?? "").localeCompare(a.scheduledAtIso ?? "")),
    [rows],
  );

  const openExpand = (row: DemoManagerWorkOrderRow) => {
    setExpandedId(row.id);
    const existing = bidsByWorkOrderId[row.id];
    setDraftById((prev) => ({ ...prev, [row.id]: prev[row.id] ?? defaultBidDraft(existing) }));
  };

  const submitBid = async (row: DemoManagerWorkOrderRow) => {
    const draft = draftById[row.id] ?? defaultBidDraft(undefined);
    const amountCents = Math.round(parseMoneyAmount(draft.amount) * 100);
    const proposedTimeIso = fromDatetimeLocalValue(draft.proposedTime);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      showToast("Enter a valid bid amount.");
      return;
    }
    if (!proposedTimeIso) {
      showToast("Choose a date and time you'll do the work.");
      return;
    }
    setSubmittingId(row.id);
    try {
      const res = await fetch("/api/portal/work-order-bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "submit",
          workOrderId: row.id,
          amountCents,
          proposedTime: proposedTimeIso,
          note: draft.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit bid.");
      await loadBids();
      showToast("Bid submitted.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not submit bid.");
    } finally {
      setSubmittingId(null);
    }
  };

  const markDone = async (row: DemoManagerWorkOrderRow) => {
    setMarkingDoneId(row.id);
    try {
      const res = await fetch("/api/portal/work-orders/mark-done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workOrderId: row.id, note: doneNoteById[row.id] ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not mark done.");
      await syncManagerWorkOrdersFromServer({ force: true });
      showToast("Marked done — the manager has been notified.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not mark done.");
    } finally {
      setMarkingDoneId(null);
    }
  };

  const renderRowDetail = (row: DemoManagerWorkOrderRow) => {
    const bid = bidsByWorkOrderId[row.id];
    const draft = draftById[row.id] ?? defaultBidDraft(bid);
    const canEditBid = row.biddingOpen && (!bid || bid.status === "submitted");
    const canMarkDone = row.bucket === "scheduled" && !row.automationStatus;

    return (
      <>
        <p className="text-sm leading-relaxed text-muted">{row.description}</p>
        {row.bucket !== "open" && row.scheduled && row.scheduled !== "—" ? (
          <p className="mt-1.5 text-xs text-muted">
            Visit scheduled for <span className="font-medium text-foreground">{row.scheduled}</span>
          </p>
        ) : null}
        {row.automationStatus === "vendor_marked_done" ? (
          <p className="mt-1.5 text-xs font-medium text-muted">Marked done — awaiting manager approval.</p>
        ) : row.automationStatus === "paid" ? (
          <p className="mt-1.5 text-xs font-medium text-muted">Approved and paid.</p>
        ) : null}

        {row.biddingOpen || bid ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Bid</p>
            {bid && !canEditBid ? (
              <p className="mt-1.5 text-xs text-muted">
                Your bid:{" "}
                <span className="font-medium text-foreground">${(bid.amountCents / 100).toFixed(2)}</span> ·{" "}
                {new Date(bid.proposedTime).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                ·{" "}
                <span
                  className={
                    bid.status === "accepted"
                      ? "font-semibold text-foreground"
                      : "font-semibold text-muted"
                  }
                >
                  {bid.status}
                </span>
              </p>
            ) : canEditBid ? (
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2">
                <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                  Your cost
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="$0"
                    value={draft.amount}
                    onChange={(e) =>
                      setDraftById((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] ?? defaultBidDraft(bid)), amount: e.target.value } }))
                    }
                    className="h-8 w-24 rounded-md text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                  When you can do it
                  <Input
                    type="datetime-local"
                    value={draft.proposedTime}
                    onChange={(e) =>
                      setDraftById((prev) => ({
                        ...prev,
                        [row.id]: { ...(prev[row.id] ?? defaultBidDraft(bid)), proposedTime: e.target.value },
                      }))
                    }
                    className="h-8 rounded-md text-sm"
                  />
                </label>
                <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-[11px] font-medium text-muted">
                  Note (optional)
                  <Input
                    type="text"
                    placeholder="Anything the manager should know"
                    value={draft.note}
                    onChange={(e) =>
                      setDraftById((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] ?? defaultBidDraft(bid)), note: e.target.value } }))
                    }
                    className="h-8 rounded-md text-sm"
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {canEditBid ? (
          <PortalTableDetailActions>
            <Button
              type="button"
              variant="primary"
              data-attr="vendor-submit-bid"
              className={`${PORTAL_DETAIL_BTN} rounded-full`}
              disabled={submittingId === row.id}
              onClick={() => void submitBid(row)}
            >
              {bid ? "Update bid" : "Submit bid"}
            </Button>
          </PortalTableDetailActions>
        ) : null}

        {canMarkDone ? (
          <div className="mt-3 border-t border-border pt-3">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              Note for the manager (optional)
              <Input
                type="text"
                placeholder="Anything the manager should know"
                value={doneNoteById[row.id] ?? ""}
                onChange={(e) => setDoneNoteById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                className="h-8 rounded-md text-sm"
              />
            </label>
            <PortalTableDetailActions>
              <Button
                type="button"
                variant="primary"
                data-attr="vendor-mark-done"
                className={`${PORTAL_DETAIL_BTN} rounded-full`}
                disabled={markingDoneId === row.id}
                onClick={() => void markDone(row)}
              >
                {markingDoneId === row.id ? "Marking done…" : "Mark done"}
              </Button>
            </PortalTableDetailActions>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <ManagerPortalPageShell title="Work Orders">
      {sorted.length === 0 ? (
        <PortalDataTableEmpty message="No work orders offered to you yet." icon="work-order" />
      ) : (
        <div>
          <div className="space-y-2 lg:hidden">
            {sorted.map((row) => {
              const bid = bidsByWorkOrderId[row.id];
              const isExpanded = expandedId === row.id;
              return (
                <div key={`wo-mobile-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button type="button" className="w-full text-left" onClick={() => (isExpanded ? setExpandedId(null) : openExpand(row))}>
                    <p className="truncate font-semibold text-foreground">{row.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{propertyLabel(row)}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <WorkOrderStatusBadge bucket={row.bucket} />
                      {row.biddingOpen ? (
                        <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                          {bid ? "Bid submitted" : "Open for bids"}
                        </span>
                      ) : null}
                      {row.automationStatus === "vendor_marked_done" ? (
                        <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                          Awaiting approval
                        </span>
                      ) : row.automationStatus === "paid" ? (
                        <span className="inline-flex rounded-full bg-accent/40 px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border">
                          Paid
                        </span>
                      ) : null}
                    </div>
                  </button>
                  <div className="mt-2">
                    <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => (isExpanded ? setExpandedId(null) : openExpand(row))}>
                      {isExpanded ? "Less" : "Details"}
                    </Button>
                  </div>
                  {isExpanded ? <div className="mt-3 border-t border-border pt-3">{renderRowDetail(row)}</div> : null}
                </div>
              );
            })}
          </div>
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={MANAGER_TABLE_TH}>Work order</th>
                    <th className={MANAGER_TABLE_TH}>Property</th>
                    <th className={MANAGER_TABLE_TH}>Scheduled visit</th>
                    <th className={MANAGER_TABLE_TH}>Status</th>
                    <th className={MANAGER_TABLE_TH}>Bid</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => {
                    const bid = bidsByWorkOrderId[row.id];
                    const isExpanded = expandedId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <tr
                          className={PORTAL_TABLE_TR_EXPANDABLE}
                          onClick={createPortalRowExpandClick(() => (isExpanded ? setExpandedId(null) : openExpand(row)))}
                          aria-expanded={isExpanded}
                        >
                          <td className={PORTAL_TABLE_TD}>
                            <p className="font-medium text-foreground">{row.title}</p>
                            {row.description ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{row.description}</p> : null}
                          </td>
                          <td className={PORTAL_TABLE_TD}>{propertyLabel(row)}</td>
                          <td className={PORTAL_TABLE_TD}>{row.scheduled || "Not yet scheduled"}</td>
                          <td className={PORTAL_TABLE_TD}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <WorkOrderStatusBadge bucket={row.bucket} />
                              {row.automationStatus === "vendor_marked_done" ? (
                                <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                                  Awaiting approval
                                </span>
                              ) : row.automationStatus === "paid" ? (
                                <span className="inline-flex rounded-full bg-accent/40 px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border">
                                  Paid
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className={PORTAL_TABLE_TD}>
                            {row.biddingOpen ? (
                              <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                                {bid ? "Submitted" : "Open"}
                              </span>
                            ) : bid?.status === "accepted" ? (
                              <span className="inline-flex rounded-full bg-accent/40 px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border">
                                Accepted
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
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
        </div>
      )}
    </ManagerPortalPageShell>
  );
}
