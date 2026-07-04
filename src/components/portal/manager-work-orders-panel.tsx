"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
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
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import {
  findWorkOrderCharge,
  HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE,
  HOUSEHOLD_CHARGES_EVENT,
  parseMoneyAmount,
  recordWorkOrderResidentCharge,
} from "@/lib/household-charges";
import { deleteManagerWorkOrderRow, updateManagerWorkOrder } from "@/lib/manager-work-orders-storage";
import {
  MANAGER_VENDORS_EVENT,
  readActiveManagerVendorRows,
  syncManagerVendorsFromServer,
} from "@/lib/manager-vendors-storage";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { parseWorkOrderCategoryFromDescription } from "@/lib/reports/formal-documents/spec";
import type { WorkOrderCategory } from "@/lib/reports/categories";
import { syncManagerWorkOrdersFromServer } from "@/lib/manager-work-orders-storage";
import { fetchWorkOrderBids, type WorkOrderBid } from "@/lib/work-order-bids";

function priorityClass(p: string) {
  const x = p.toLowerCase();
  if (x === "high") return "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (x === "medium") return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  return "bg-accent/30 text-muted ring-1 ring-border";
}

type BillDraft = { cost: string; paymentStatus: "pending" | "paid" };

function defaultBillDraft(row: DemoManagerWorkOrderRow): BillDraft {
  const cost = row.cost !== "—" && row.cost.trim() ? row.cost : "";
  return { cost, paymentStatus: "pending" };
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

// Restrict photo links to http(s) or inline image data URLs before they reach an
// <a href> / <Image src> sink — inlined as a guard clause at each call site (rather
// than routed through a helper's return value) so CodeQL's xss-through-dom barrier
// recognition sees the check (see commit 924bd45 for the same fix elsewhere).
const SAFE_PHOTO_HREF_RE = /^(?:data:image\/|https?:\/\/)/;

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
  const [vendorTick, setVendorTick] = useState(0);
  const [completeRow, setCompleteRow] = useState<DemoManagerWorkOrderRow | null>(null);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeDraft, setCompleteDraft] = useState({
    category: "general" as WorkOrderCategory,
    vendorCost: "",
    materialsCost: "",
    materialsMemo: "",
    workDoneSummary: "",
  });
  const [bidsByWorkOrderId, setBidsByWorkOrderId] = useState<Record<string, WorkOrderBid[]>>({});
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);
  const [autoSchedulingId, setAutoSchedulingId] = useState<string | null>(null);

  useEffect(() => {
    void syncManagerVendorsFromServer();
    const onVendors = () => setVendorTick((n) => n + 1);
    window.addEventListener(MANAGER_VENDORS_EVENT, onVendors);
    return () => window.removeEventListener(MANAGER_VENDORS_EVENT, onVendors);
  }, []);

  const activeVendors = useMemo(() => {
    void vendorTick;
    return readActiveManagerVendorRows();
  }, [vendorTick]);

  const rows = useMemo(() => allRows.filter((r) => r.bucket === bucket), [allRows, bucket]);

  useEffect(() => {
    const on = () => setHcTick((n) => n + 1);
    window.addEventListener(HOUSEHOLD_CHARGES_EVENT, on);
    return () => window.removeEventListener(HOUSEHOLD_CHARGES_EVENT, on);
  }, []);

  const loadBids = useCallback(async (workOrderId: string) => {
    const bids = await fetchWorkOrderBids(workOrderId);
    setBidsByWorkOrderId((prev) => ({ ...prev, [workOrderId]: bids }));
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
      if (!row.selfAssigned && row.vendorId) void loadBids(row.id);
    },
    [loadBids],
  );

  const effectiveManagerId = managerUserId ?? HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE;

  const tryAutoChargeScheduled = useCallback(() => {
    if (!authReady) return;
    for (const row of allRows) {
      if (row.bucket !== "scheduled") continue;
      if (findWorkOrderCharge(row.id)) continue;
      const draft = billDraftById[row.id] ?? defaultBillDraft(row);
      const amountInput = draft.cost.trim() ? draft.cost : row.cost;
      const amt = parseMoneyAmount(amountInput);
      const email = (row.residentEmail ?? "").trim().toLowerCase();
      if (amt <= 0 || !email.includes("@")) continue;
      const created = recordWorkOrderResidentCharge({
        managerUserId: effectiveManagerId,
        workOrderId: row.id,
        propertyId: row.propertyId || row.assignedPropertyId,
        propertyLabel: row.propertyName,
        unit: row.unit,
        workOrderTitle: row.title,
        amountInput,
        residentEmail: row.residentEmail ?? "",
        residentName: row.residentName ?? "",
        initialStatus: draft.paymentStatus,
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

  const chargeByWoId = useMemo(() => {
    void hcTick;
    const m = new Map<string, ReturnType<typeof findWorkOrderCharge>>();
    for (const r of rows) {
      const c = findWorkOrderCharge(r.id);
      if (c) m.set(r.id, c);
    }
    return m;
  }, [rows, hcTick]);

  /** Email the assigned vendor the visit details. Returns true if a send was attempted and accepted. */
  const sendVendorVisitEmail = useCallback(
    async (row: DemoManagerWorkOrderRow, iso: string): Promise<boolean> => {
      if (row.selfAssigned || !row.vendorId) return false;
      const vendor = activeVendors.find((v) => v.id === row.vendorId);
      const vendorEmail = vendor?.email?.trim() ?? "";
      if (!vendor || !vendorEmail.includes("@")) return false;
      try {
        const res = await fetch("/api/portal/send-vendor-visit-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            workOrderId: row.id,
            vendorId: vendor.id,
            vendorEmail,
            vendorName: vendor.name,
            workOrderTitle: row.title,
            propertyLabel: row.propertyName,
            unit: row.unit,
            visitLabel: formatScheduledLabel(iso),
            description: row.description,
            preferredArrival: row.preferredArrival,
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [activeVendors],
  );

  /** Commit a resolved visit time (manual or auto-scheduled) — bucket/status transition,
   * best-effort billing charge, and the vendor email + inbox notification, all shared so
   * auto-schedule reuses exactly the same write + notify path as picking a time by hand. */
  const commitScheduledVisit = useCallback(
    async (row: DemoManagerWorkOrderRow, iso: string) => {
      const draft = billDraftById[row.id] ?? defaultBillDraft(row);
      const costTrimmed = draft.cost.trim();
      const amt = costTrimmed ? parseMoneyAmount(costTrimmed) : 0;
      const residentEmail = (row.residentEmail ?? "").trim();

      updateManagerWorkOrder(row.id, (r) => ({
        ...r,
        bucket: "scheduled",
        status: "Scheduled",
        scheduledAtIso: iso,
        scheduled: formatScheduledLabel(iso),
        ...(costTrimmed && Number.isFinite(amt) && amt >= 0 ? { cost: `$${amt.toFixed(2)}` } : {}),
      }));

      let created = null;
      if (residentEmail.includes("@") && Number.isFinite(amt) && amt > 0) {
        created = recordWorkOrderResidentCharge({
          managerUserId: effectiveManagerId,
          workOrderId: row.id,
          propertyId: row.propertyId || row.assignedPropertyId,
          propertyLabel: row.propertyName,
          unit: row.unit,
          workOrderTitle: row.title,
          amountInput: draft.cost,
          residentEmail,
          residentName: row.residentName ?? "",
          initialStatus: draft.paymentStatus,
        });
      }
      if (created) setHcTick((n) => n + 1);
      const vendorEmailed = await sendVendorVisitEmail(row, iso);
      const billingPart = created
        ? created.status === "paid"
          ? " Payment recorded as paid."
          : " Pending payment created."
        : "";
      showToast(`Work order scheduled.${billingPart}${vendorEmailed ? " Vendor emailed with the visit details." : ""}`);
      setExpandedId(null);
      onAfterSchedule?.();
    },
    [billDraftById, effectiveManagerId, onAfterSchedule, sendVendorVisitEmail, showToast],
  );

  /** Schedule the visit (date required). Billing is optional — a charge is only created when a cost is set and a resident is linked. */
  const saveScheduleFromOpen = async (row: DemoManagerWorkOrderRow) => {
    const visitAt = visitAtById[row.id] ?? "";
    const iso = fromDatetimeLocalValue(visitAt);
    if (!iso) {
      showToast("Choose a visit date and time to schedule.");
      return;
    }
    await commitScheduledVisit(row, iso);
  };

  /** Resolve the assigned vendor's next open slot from their set availability (weekly
   * windows minus blocked dates minus their other scheduled visits) and book it — same
   * commit path as scheduling by hand, so the vendor gets the same email + inbox notice. */
  const autoScheduleVisit = async (row: DemoManagerWorkOrderRow) => {
    if (row.selfAssigned || !row.vendorId) {
      showToast("Assign a vendor before auto-scheduling.");
      return;
    }
    setAutoSchedulingId(row.id);
    try {
      const res = await fetch("/api/portal-work-orders/auto-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workOrderId: row.id, vendorId: row.vendorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not auto-schedule.");
      if (!data.iso) {
        showToast(
          data.reason === "no_availability"
            ? "This vendor hasn't set their availability yet."
            : "No open slot found in the vendor's availability.",
        );
        return;
      }
      setVisitAtById((prev) => ({ ...prev, [row.id]: toDatetimeLocalValue(data.iso) }));
      await commitScheduledVisit(row, data.iso);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not auto-schedule.");
    } finally {
      setAutoSchedulingId(null);
    }
  };

  const rescheduleVisit = async (row: DemoManagerWorkOrderRow) => {
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
    const vendorEmailed = await sendVendorVisitEmail(row, iso);
    showToast(vendorEmailed ? "Visit time updated. Vendor emailed with the new time." : "Visit time updated.");
  };

  const openCompleteModal = (row: DemoManagerWorkOrderRow) => {
    if (row.bucket !== "scheduled") return;
    setCompleteRow(row);
    setCompleteDraft({
      category: row.category ?? parseWorkOrderCategoryFromDescription(row.description),
      vendorCost: row.vendorCostCents ? String(row.vendorCostCents / 100) : "",
      materialsCost: row.materialsCostCents ? String(row.materialsCostCents / 100) : "",
      materialsMemo: row.materialsMemo ?? "",
      workDoneSummary: row.workDoneSummary ?? row.title,
    });
  };

  const submitComplete = async () => {
    if (!completeRow) return;
    setCompleteBusy(true);
    try {
      const vendorCostCents = completeDraft.vendorCost.trim()
        ? Math.round(Number.parseFloat(completeDraft.vendorCost.replace(/[^0-9.]/g, "")) * 100)
        : 0;
      const materialsCostCents = completeDraft.materialsCost.trim()
        ? Math.round(Number.parseFloat(completeDraft.materialsCost.replace(/[^0-9.]/g, "")) * 100)
        : 0;
      const res = await fetch("/api/portal/work-orders/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workOrder: completeRow,
          category: completeDraft.category,
          vendorCostCents: vendorCostCents > 0 ? vendorCostCents : undefined,
          materialsCostCents: materialsCostCents > 0 ? materialsCostCents : undefined,
          materialsMemo: completeDraft.materialsMemo,
          workDoneSummary: completeDraft.workDoneSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not complete work order.");
      updateManagerWorkOrder(completeRow.id, () => data.workOrder as DemoManagerWorkOrderRow);
      void syncManagerWorkOrdersFromServer();
      showToast(
        data.expenseEntryIds?.length
          ? "Work order completed and expenses logged."
          : "Work order marked complete.",
      );
      setCompleteRow(null);
      setExpandedId(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not complete work order.");
    } finally {
      setCompleteBusy(false);
    }
  };

  const markComplete = (row: DemoManagerWorkOrderRow) => {
    openCompleteModal(row);
  };

  const createBillingCharge = (row: DemoManagerWorkOrderRow) => {
    const existing = findWorkOrderCharge(row.id);
    if (existing) {
      showToast("A payment line already exists for this work order.");
      return;
    }
    const draft = billDraftById[row.id] ?? defaultBillDraft(row);
    const amt = parseMoneyAmount(draft.cost);
    const residentEmail = (row.residentEmail ?? "").trim();
    if (!draft.cost.trim() || !Number.isFinite(amt) || amt <= 0) {
      showToast("Enter a valid cost first.");
      return;
    }
    if (!residentEmail.includes("@")) {
      showToast("No resident is linked to this work order, so it can't be billed.");
      return;
    }
    const created = recordWorkOrderResidentCharge({
      managerUserId: effectiveManagerId,
      workOrderId: row.id,
      propertyId: row.propertyId || row.assignedPropertyId,
      propertyLabel: row.propertyName,
      unit: row.unit,
      workOrderTitle: row.title,
      amountInput: draft.cost,
      residentEmail,
      residentName: row.residentName ?? "",
      initialStatus: draft.paymentStatus,
    });
    if (!created) {
      showToast("Could not create payment line.");
      return;
    }
    updateManagerWorkOrder(row.id, (r) => ({ ...r, cost: `$${amt.toFixed(2)}` }));
    setHcTick((n) => n + 1);
    showToast(created.status === "paid" ? "Payment recorded as paid." : "Pending payment line created.");
  };

  /** Persist cost without changing bucket. */
  const saveLoggedCost = (row: DemoManagerWorkOrderRow, linkedCharge: ReturnType<typeof findWorkOrderCharge>) => {
    if (linkedCharge) {
      showToast("Cost is locked while a payment line exists.");
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

  const assignVendor = (row: DemoManagerWorkOrderRow, choice: string) => {
    if (choice === "self") {
      updateManagerWorkOrder(row.id, (r) => ({
        ...r,
        vendorId: undefined,
        vendorName: undefined,
        vendorAssignedAt: undefined,
        selfAssigned: true,
      }));
      showToast("You're handling this yourself — no vendor email will be sent.");
      return;
    }
    if (!choice) {
      updateManagerWorkOrder(row.id, (r) => ({
        ...r,
        vendorId: undefined,
        vendorName: undefined,
        vendorAssignedAt: undefined,
        selfAssigned: false,
      }));
      showToast("Vendor unassigned.");
      return;
    }
    const vendor = activeVendors.find((v) => v.id === choice);
    if (!vendor) {
      showToast("Vendor not found.");
      return;
    }
    updateManagerWorkOrder(row.id, (r) => ({
      ...r,
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorAssignedAt: new Date().toISOString(),
      selfAssigned: false,
    }));
    showToast(`Assigned ${vendor.name}.`);
  };

  /** Invite the assigned vendor to submit a cost/time bid — reuses the same email + inbox
   * notification path as the visit-scheduled email (send-vendor-visit-email), just with
   * bid-offer copy instead of a scheduled-visit time. */
  const offerForBids = async (row: DemoManagerWorkOrderRow) => {
    if (row.selfAssigned || !row.vendorId) {
      showToast("Assign a vendor before inviting them to bid.");
      return;
    }
    const vendor = activeVendors.find((v) => v.id === row.vendorId);
    const vendorEmail = vendor?.email?.trim() ?? "";
    if (!vendor || !vendorEmail.includes("@")) {
      showToast("That vendor doesn't have a valid email on file.");
      return;
    }
    try {
      await fetch("/api/portal/send-vendor-visit-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "bid_offer",
          workOrderId: row.id,
          vendorId: vendor.id,
          vendorEmail,
          vendorName: vendor.name,
          workOrderTitle: row.title,
          propertyLabel: row.propertyName,
          unit: row.unit,
          visitLabel: row.scheduled && row.scheduled !== "—" ? row.scheduled : "",
          description: row.description,
        }),
      });
    } catch {
      /* best-effort notification; bidding still opens locally */
    }
    updateManagerWorkOrder(row.id, (r) => ({ ...r, biddingOpen: true, biddingOpenedAt: new Date().toISOString() }));
    showToast(`${vendor.name} invited to bid.`);
  };

  const closeBidding = (row: DemoManagerWorkOrderRow) => {
    updateManagerWorkOrder(row.id, (r) => ({ ...r, biddingOpen: false }));
    showToast("Bidding closed.");
  };

  const acceptBidHandler = async (bid: WorkOrderBid) => {
    setAcceptingBidId(bid.id);
    try {
      const res = await fetch("/api/portal/work-order-bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "accept", bidId: bid.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not accept bid.");
      await syncManagerWorkOrdersFromServer({ force: true });
      await loadBids(bid.workOrderId);
      showToast("Bid accepted — vendor assigned at the agreed cost.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not accept bid.");
    } finally {
      setAcceptingBidId(null);
    }
  };

  const renderRowDetail = (row: DemoManagerWorkOrderRow) => {
    const draft = billDraftById[row.id] ?? defaultBillDraft(row);
    const linkedCharge = chargeByWoId.get(row.id);
    const visitAt = visitAtById[row.id] ?? "";
    const assignedVendor =
      !row.selfAssigned && row.vendorId
        ? activeVendors.find((v) => v.id === row.vendorId) ?? null
        : null;
    const assignedVendorEmail = assignedVendor?.email?.trim() ?? "";

    return (
      <>
                        <p className="text-sm leading-relaxed text-muted">{row.description}</p>
                        <p className="mt-1.5 text-xs text-muted">
                          Resident preferred arrival:{" "}
                          <span className="font-medium text-muted">{row.preferredArrival?.trim() || "Anytime"}</span>
                        </p>
                        {row.bucket !== "open" && row.scheduled && row.scheduled !== "—" ? (
                          <p className="mt-1.5 text-xs text-muted">
                            Visit scheduled for <span className="font-medium text-foreground">{row.scheduled}</span>
                          </p>
                        ) : null}
                        {row.photoDataUrls?.length ? (
                          <div className="mt-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Photos</p>
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {row.photoDataUrls.map((src, index) => {
                                const trimmed = src.trim();
                                if (!SAFE_PHOTO_HREF_RE.test(trimmed)) return null;
                                return (
                                <a
                                  key={`${row.id}-photo-${index}`}
                                  href={trimmed}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block overflow-hidden rounded-xl border border-border bg-accent/30"
                                >
                                  <Image
                                    src={trimmed}
                                    alt={`Work order photo ${index + 1}`}
                                    width={240}
                                    height={180}
                                    className="h-28 w-full object-cover"
                                    unoptimized
                                  />
                                </a>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2">
                          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                            Cost
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="$0"
                              value={draft.cost}
                              onChange={(e) =>
                                setBillDraftById((prev) => ({
                                  ...prev,
                                  [row.id]: { ...(prev[row.id] ?? defaultBillDraft(row)), cost: e.target.value },
                                }))
                              }
                              className="h-8 w-24 rounded-md text-sm"
                            />
                          </label>
                          {!linkedCharge ? (
                            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                              Payment
                              <Select
                                className="h-8 rounded-md text-xs"
                                value={draft.paymentStatus}
                                onChange={(e) =>
                                  setBillDraftById((prev) => ({
                                    ...prev,
                                    [row.id]: {
                                      ...(prev[row.id] ?? defaultBillDraft(row)),
                                      paymentStatus: e.target.value as "pending" | "paid",
                                    },
                                  }))
                                }
                              >
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                              </Select>
                            </label>
                          ) : (
                            <span className="pb-1.5 text-xs text-muted">
                              {linkedCharge.status === "paid" ? "Paid" : "Pending"} · {linkedCharge.amountLabel}
                            </span>
                          )}
                          {row.bucket !== "completed" ? (
                            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                              Visit date
                              <Input
                                type="datetime-local"
                                value={visitAt}
                                onChange={(e) =>
                                  setVisitAtById((prev) => ({ ...prev, [row.id]: e.target.value }))
                                }
                                className="h-8 rounded-md text-sm"
                              />
                            </label>
                          ) : null}
                          {row.bucket !== "completed" ? (
                            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                              Vendor
                              <Select
                                className="h-8 min-w-[150px] rounded-md text-xs"
                                value={row.selfAssigned ? "self" : row.vendorId ?? ""}
                                onChange={(e) => assignVendor(row, e.target.value)}
                              >
                                <option value="">None</option>
                                <option value="self">Self</option>
                                {activeVendors.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                              </Select>
                            </label>
                          ) : row.vendorName ? (
                            <span className="pb-1.5 text-xs text-muted">
                              Vendor: <span className="font-medium text-foreground">{row.vendorName}</span>
                            </span>
                          ) : row.selfAssigned ? (
                            <span className="pb-1.5 text-xs text-muted">Self-handled</span>
                          ) : null}
                          {assignedVendor?.phone ? (
                            <a href={`tel:${assignedVendor.phone}`} className="pb-1.5 text-xs font-medium text-primary hover:underline">
                              Call
                            </a>
                          ) : null}
                          {assignedVendorEmail ? (
                            <a href={`mailto:${assignedVendorEmail}`} className="pb-1.5 text-xs font-medium text-primary hover:underline">
                              Email
                            </a>
                          ) : null}
                        </div>

                        {!row.selfAssigned && row.vendorId && row.bucket !== "completed" ? (
                          <div className="mt-3 border-t border-border pt-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted">Bidding</p>
                              {row.biddingOpen ? (
                                <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                                  Open for bids
                                </span>
                              ) : row.biddingResolvedAt ? (
                                <span className="inline-flex rounded-full bg-accent/40 px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border">
                                  Bid accepted
                                </span>
                              ) : null}
                              {row.biddingOpen ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  data-attr="work-order-close-bidding"
                                  className={PORTAL_DETAIL_BTN}
                                  onClick={() => closeBidding(row)}
                                >
                                  Close bidding
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  data-attr="work-order-invite-bid"
                                  className={PORTAL_DETAIL_BTN}
                                  onClick={() => void offerForBids(row)}
                                >
                                  Invite for bids
                                </Button>
                              )}
                            </div>
                            {(bidsByWorkOrderId[row.id] ?? []).length > 0 ? (
                              <div className="mt-2 space-y-1.5">
                                {(bidsByWorkOrderId[row.id] ?? []).map((bid) => (
                                  <div
                                    key={bid.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
                                  >
                                    <div>
                                      <span className="font-medium text-foreground">{bid.vendorName || "Vendor"}</span>{" "}
                                      · ${(bid.amountCents / 100).toFixed(2)} ·{" "}
                                      {new Date(bid.proposedTime).toLocaleString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}
                                      {bid.note ? <p className="mt-0.5 text-muted">{bid.note}</p> : null}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={
                                          bid.status === "accepted"
                                            ? "inline-flex rounded-full bg-accent/40 px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border"
                                            : bid.status === "declined"
                                              ? "inline-flex rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-semibold text-muted ring-1 ring-border"
                                              : "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]"
                                        }
                                      >
                                        {bid.status}
                                      </span>
                                      {bid.status === "submitted" ? (
                                        <Button
                                          type="button"
                                          variant="primary"
                                          data-attr="work-order-accept-bid"
                                          className="h-7 rounded-full px-3 text-xs"
                                          disabled={acceptingBidId === bid.id}
                                          onClick={() => void acceptBidHandler(bid)}
                                        >
                                          Accept
                                        </Button>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : row.biddingOpen ? (
                              <p className="mt-2 text-xs text-muted">No bids yet.</p>
                            ) : null}
                          </div>
                        ) : null}

                        <PortalTableDetailActions>
                          {row.bucket === "open" ? (
                            <Button
                              type="button"
                              variant="primary"
                              className={`${PORTAL_DETAIL_BTN} rounded-full`}
                              onClick={() => void saveScheduleFromOpen(row)}
                            >
                              Schedule visit
                            </Button>
                          ) : row.bucket === "scheduled" ? (
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => void rescheduleVisit(row)}>
                              Save new time
                            </Button>
                          ) : null}
                          {!row.selfAssigned && row.vendorId && row.bucket !== "completed" ? (
                            <Button
                              type="button"
                              variant="outline"
                              data-attr="work-order-auto-schedule"
                              className={PORTAL_DETAIL_BTN}
                              disabled={autoSchedulingId === row.id}
                              onClick={() => void autoScheduleVisit(row)}
                            >
                              {autoSchedulingId === row.id ? "Finding a slot…" : "Auto-schedule"}
                            </Button>
                          ) : null}
                          {!linkedCharge ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_DETAIL_BTN}
                                onClick={() => saveLoggedCost(row, linkedCharge)}
                              >
                                Save cost
                              </Button>
                              <Button
                                type="button"
                                variant="primary"
                                className={`${PORTAL_DETAIL_BTN} rounded-full`}
                                onClick={() => createBillingCharge(row)}
                              >
                                Create payment line
                              </Button>
                            </>
                          ) : null}
                          {row.bucket === "scheduled" ? (
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => markComplete(row)}>
                              Mark complete
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
                            onClick={() => onDeleteWorkOrder(row)}
                          >
                            Delete work order
                          </Button>
                        </PortalTableDetailActions>
      </>
    );
  };

  if (rows.length === 0) {
    return (
      <PortalDataTableEmpty
        icon="work-order"
        message={allRows.length === 0 ? "No work orders yet." : "No work orders in this bucket yet."}
      />
    );
  }

  return (
    <div>
      <div className="space-y-2 lg:hidden">
        {rows.map((row) => {
          const linkedCharge = chargeByWoId.get(row.id);
          const isExpanded = expandedId === row.id;
          return (
            <div key={`wo-mobile-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => (isExpanded ? setExpandedId(null) : openExpand(row))}
              >
                <p className="truncate font-semibold text-foreground">{row.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {[row.propertyName, row.unit].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}>
                    {row.priority}
                  </span>
                  <span className="text-xs text-muted">{row.cost !== "—" && row.cost.trim() ? row.cost : "—"}</span>
                  {linkedCharge?.status === "paid" ? (
                    <span className="inline-flex rounded-full bg-accent/40 px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border">
                      Paid
                    </span>
                  ) : linkedCharge?.status === "pending" ? (
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                      Pending
                    </span>
                  ) : null}
                </div>
              </button>
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  className={PORTAL_DETAIL_BTN}
                  onClick={() => (isExpanded ? setExpandedId(null) : openExpand(row))}
                >
                  {isExpanded ? "Less" : "Details"}
                </Button>
              </div>
              {isExpanded ? (
                <div className="mt-3 border-t border-border pt-3">{renderRowDetail(row)}</div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className="min-w-[640px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Property · Unit</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Priority</th>
                <th className={`${MANAGER_TABLE_TH} text-left`}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const linkedCharge = chargeByWoId.get(row.id);
                const isExpanded = expandedId === row.id;

                return (
                  <Fragment key={row.id}>
                    <tr
                      className={PORTAL_TABLE_TR_EXPANDABLE}
                      onClick={createPortalRowExpandClick(() =>
                        isExpanded ? setExpandedId(null) : openExpand(row),
                      )}
                      aria-expanded={isExpanded}
                    >
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                        {row.title}
                        <p className="mt-0.5 text-[11px] font-normal text-muted line-clamp-1">{row.description}</p>
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className="text-foreground">{row.propertyName}</span>
                        {row.unit ? <span className="text-muted"> · {row.unit}</span> : null}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}>
                          {row.priority}
                        </span>
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <div className="flex flex-col gap-1">
                          <span>{row.cost !== "—" && row.cost.trim() ? row.cost : "—"}</span>
                          {linkedCharge?.status === "paid" ? (
                            <span className="inline-flex w-fit rounded-full bg-accent/40 px-2 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border">
                              Paid
                            </span>
                          ) : linkedCharge?.status === "pending" ? (
                            <span className="inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                              Pending
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
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

      <Modal open={Boolean(completeRow)} onClose={() => setCompleteRow(null)} title="Complete work order">
        {completeRow ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {completeRow.propertyName} · {completeRow.title}
            </p>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Category
              <select
                className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                value={completeDraft.category}
                onChange={(e) => setCompleteDraft({ ...completeDraft, category: e.target.value as WorkOrderCategory })}
                disabled={completeBusy}
              >
                <option value="cleaning">Cleaning</option>
                <option value="plumbing">Plumbing</option>
                <option value="mold">Mold remediation</option>
                <option value="electrical">Electrical</option>
                <option value="hvac">HVAC</option>
                <option value="appliance">Appliance</option>
                <option value="access">Access / Locks</option>
                <option value="general">General maintenance</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Vendor / labor cost (USD)
              <Input
                value={completeDraft.vendorCost}
                onChange={(e) => setCompleteDraft({ ...completeDraft, vendorCost: e.target.value })}
                disabled={completeBusy}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Materials / equipment cost (USD)
              <Input
                value={completeDraft.materialsCost}
                onChange={(e) => setCompleteDraft({ ...completeDraft, materialsCost: e.target.value })}
                disabled={completeBusy}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Materials notes
              <Input
                value={completeDraft.materialsMemo}
                onChange={(e) => setCompleteDraft({ ...completeDraft, materialsMemo: e.target.value })}
                disabled={completeBusy}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Work done summary
              <Input
                value={completeDraft.workDoneSummary}
                onChange={(e) => setCompleteDraft({ ...completeDraft, workDoneSummary: e.target.value })}
                disabled={completeBusy}
              />
            </label>
            <div className="flex justify-start gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCompleteRow(null)} disabled={completeBusy}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={() => void submitComplete()} disabled={completeBusy}>
                Complete &amp; log expenses
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
