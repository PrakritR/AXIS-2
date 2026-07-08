"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { PORTAL_DATA_TABLE, PortalDataTableColGroup, portalTableColumnPercents, PORTAL_DATA_TABLE_SCROLL,
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
  PortalTableInlineExpand,
  createPortalRowExpandClick,} from "@/components/portal/portal-data-table";
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import {
  findWorkOrderCharge,
  HOUSEHOLD_CHARGE_DEMO_MANAGER_SCOPE,
  HOUSEHOLD_CHARGES_EVENT,
  parseMoneyAmount,
  recordWorkOrderResidentCharge,
  updateHouseholdChargeAmount,
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
import { isWorkOrderCostLockedByVendor } from "@/lib/work-order-cost-lock";

function priorityClass(p: string) {
  const x = p.toLowerCase();
  if (x === "high") return "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (x === "medium") return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  return "bg-accent/30 text-muted ring-1 ring-border";
}

type BillDraft = { cost: string; paymentStatus: "pending" | "paid" };

function isSetWorkOrderCost(cost: string | undefined): boolean {
  const trimmed = cost?.trim() ?? "";
  return trimmed !== "" && trimmed !== "—";
}

function displayWorkOrderCost(cost: string | undefined): string {
  return isSetWorkOrderCost(cost) ? (cost ?? "") : "—";
}

function defaultBillDraft(row: DemoManagerWorkOrderRow): BillDraft {
  const cost = isSetWorkOrderCost(row.cost) ? (row.cost ?? "") : "";
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

/** $500+ triggers a confirm-preview before Approve + Pay; below it, one tap completes
 * and pays immediately. Bump this single constant to change the cutoff. */
const APPROVE_PAY_CONFIRM_THRESHOLD_CENTS = 50_000;

function approvePayDefaults(row: DemoManagerWorkOrderRow) {
  return {
    category: row.category ?? parseWorkOrderCategoryFromDescription(row.description),
    vendorCostCents: row.vendorCostCents ?? Math.round(parseMoneyAmount(row.cost) * 100),
    materialsCostCents: row.materialsCostCents ?? 0,
    materialsMemo: row.materialsMemo ?? "",
    workDoneSummary: row.workDoneSummary || row.vendorMarkedDoneNote || row.title,
  };
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
  const [approvePayRow, setApprovePayRow] = useState<DemoManagerWorkOrderRow | null>(null);
  const [approvePayBusy, setApprovePayBusy] = useState(false);

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
      if (!row.selfAssigned && (row.vendorId || row.biddingOpen || row.biddingResolvedAt)) void loadBids(row.id);
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
      const amountInput = draft.cost.trim() ? draft.cost : isSetWorkOrderCost(row.cost) ? (row.cost ?? "") : "";
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

  /** Runs the same completion + expense-logging as "Mark complete", then marks the vendor
   * paid (bookkeeping status only — see APPROVE_PAY_CONFIRM_THRESHOLD_CENTS for the
   * one-tap vs confirm-preview gate). */
  const submitApprovePay = async (row: DemoManagerWorkOrderRow) => {
    setApprovePayBusy(true);
    try {
      const res = await fetch("/api/portal/work-orders/approve-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workOrder: row, ...approvePayDefaults(row) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not approve payment.");
      updateManagerWorkOrder(row.id, () => data.workOrder as DemoManagerWorkOrderRow);
      void syncManagerWorkOrdersFromServer();
      showToast("Approved and paid.");
      setApprovePayRow(null);
      setExpandedId(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not approve payment.");
    } finally {
      setApprovePayBusy(false);
    }
  };

  const approvePay = (row: DemoManagerWorkOrderRow) => {
    const { vendorCostCents, materialsCostCents } = approvePayDefaults(row);
    if (vendorCostCents + materialsCostCents < APPROVE_PAY_CONFIRM_THRESHOLD_CENTS) {
      void submitApprovePay(row);
    } else {
      setApprovePayRow(row);
    }
  };

  /** Auto-save the Cost field and, once a resident is linked and the amount warrants it,
   * auto-create or update the payment line. Locked only when a vendor fixed the price
   * (set-vendor-price or accepted bid). */
  const commitBilling = useCallback(
    (row: DemoManagerWorkOrderRow, overrides?: Partial<BillDraft>) => {
      if (isWorkOrderCostLockedByVendor(row)) return;
      const draft = { ...(billDraftById[row.id] ?? defaultBillDraft(row)), ...overrides };
      const trimmed = draft.cost.trim();
      if (!trimmed) {
        if (isSetWorkOrderCost(row.cost)) updateManagerWorkOrder(row.id, (r) => ({ ...r, cost: "—" }));
        return;
      }
      const amt = parseMoneyAmount(trimmed);
      if (!Number.isFinite(amt) || amt < 0) return;
      const residentEmail = (row.residentEmail ?? "").trim();
      const existing = findWorkOrderCharge(row.id);
      if (existing) {
        if (updateHouseholdChargeAmount(existing.id, amt, effectiveManagerId)) {
          updateManagerWorkOrder(row.id, (r) => ({ ...r, cost: `$${amt.toFixed(2)}` }));
          setHcTick((n) => n + 1);
        }
        return;
      }
      if (amt > 0 && residentEmail.includes("@")) {
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
        if (created) {
          updateManagerWorkOrder(row.id, (r) => ({ ...r, cost: `$${amt.toFixed(2)}` }));
          setHcTick((n) => n + 1);
          showToast(created.status === "paid" ? "Payment recorded as paid." : "Pending payment line created.");
        }
      } else {
        updateManagerWorkOrder(row.id, (r) => ({ ...r, cost: `$${amt.toFixed(2)}` }));
      }
    },
    [billDraftById, effectiveManagerId, showToast],
  );

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
        vendorPriceSetAt: undefined,
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
                        {row.automationStatus === "vendor_marked_done" ? (
                          <p className="mt-1.5 text-xs font-medium text-muted">
                            Vendor marked this done{row.vendorMarkedDoneNote ? ` — "${row.vendorMarkedDoneNote}"` : ""}. Awaiting your approval.
                          </p>
                        ) : row.automationStatus === "paid" ? (
                          <p className="mt-1.5 text-xs font-medium text-muted">Approved and paid.</p>
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
                              disabled={isWorkOrderCostLockedByVendor(row)}
                              data-attr="work-order-cost-input"
                              onChange={(e) =>
                                setBillDraftById((prev) => ({
                                  ...prev,
                                  [row.id]: { ...(prev[row.id] ?? defaultBillDraft(row)), cost: e.target.value },
                                }))
                              }
                              onBlur={() => commitBilling(row)}
                              className="h-8 w-24 rounded-md text-sm"
                            />
                          </label>
                          {!linkedCharge ? (
                            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                              Payment
                              <Select
                                className="h-8 rounded-md text-xs"
                                value={draft.paymentStatus}
                                data-attr="work-order-payment-status-select"
                                onChange={(e) => {
                                  const paymentStatus = e.target.value as "pending" | "paid";
                                  setBillDraftById((prev) => ({
                                    ...prev,
                                    [row.id]: {
                                      ...(prev[row.id] ?? defaultBillDraft(row)),
                                      paymentStatus,
                                    },
                                  }));
                                  commitBilling(row, { paymentStatus });
                                }}
                              >
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                              </Select>
                            </label>
                          ) : null}
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

                        {(bidsByWorkOrderId[row.id] ?? []).length > 0 ? (
                          <div className="mt-3 border-t border-border pt-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted">Bids</p>
                            <div className="mt-2 space-y-1.5">
                                {(bidsByWorkOrderId[row.id] ?? []).map((bid) => {
                                  const pricingPending = bid.amountCents == null;
                                  const totalCents = (bid.amountCents ?? 0) + bid.materialsCents;
                                  return (
                                  <div
                                    key={bid.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
                                  >
                                    <div>
                                      <span className="font-medium text-foreground">{bid.vendorName || "Vendor"}</span>{" "}
                                      <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
                                        {bid.quoteMode === "after_consultation" ? "After consultation" : "Upfront"}
                                      </span>
                                      {pricingPending ? (
                                        <span className="ml-1 text-muted">
                                          · Consultation{" "}
                                          {bid.consultationVisitAt
                                            ? `scheduled for ${new Date(bid.consultationVisitAt).toLocaleString(undefined, {
                                                month: "short",
                                                day: "numeric",
                                                hour: "numeric",
                                                minute: "2-digit",
                                              })}`
                                            : "pending"}{" "}
                                          — pricing pending
                                        </span>
                                      ) : (
                                        <span className="text-muted">
                                          {" "}
                                          · ${(totalCents / 100).toFixed(2)} (labor ${((bid.amountCents ?? 0) / 100).toFixed(2)} + materials $
                                          {(bid.materialsCents / 100).toFixed(2)}) ·{" "}
                                          {bid.proposedTime
                                            ? new Date(bid.proposedTime).toLocaleString(undefined, {
                                                month: "short",
                                                day: "numeric",
                                                hour: "numeric",
                                                minute: "2-digit",
                                              })
                                            : "—"}
                                        </span>
                                      )}
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
                                      {bid.status === "submitted" && !pricingPending ? (
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
                                  );
                                })}
                            </div>
                          </div>
                        ) : null}

                        <PortalTableDetailActions>
                          {row.bucket === "open" ? (
                            <>
                              <Button
                                type="button"
                                variant="primary"
                                className={`${PORTAL_DETAIL_BTN} rounded-full`}
                                onClick={() => void saveScheduleFromOpen(row)}
                              >
                                Schedule visit
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
                                onClick={() => onDeleteWorkOrder(row)}
                              >
                                Delete
                              </Button>
                            </>
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
                          {row.bucket === "scheduled" && row.automationStatus === "vendor_marked_done" ? (
                            <Button
                              type="button"
                              variant="primary"
                              data-attr="work-order-approve-pay"
                              className={`${PORTAL_DETAIL_BTN} rounded-full`}
                              disabled={approvePayBusy}
                              onClick={() => approvePay(row)}
                            >
                              Approve &amp; pay
                            </Button>
                          ) : row.bucket === "scheduled" ? (
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => markComplete(row)}>
                              Mark complete
                            </Button>
                          ) : null}
                          {row.bucket !== "open" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-[var(--status-overdue-bg)]`}
                              onClick={() => onDeleteWorkOrder(row)}
                            >
                              Delete
                            </Button>
                          ) : null}
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
                className="flex w-full gap-2 text-left"
                onClick={() => (isExpanded ? setExpandedId(null) : openExpand(row))}
                aria-expanded={isExpanded}
              >
                <div className="min-w-0 flex-1">
                  <PortalTableInlineExpand expanded={isExpanded} className="font-semibold text-foreground">
                    <span className="truncate">{row.title}</span>
                  </PortalTableInlineExpand>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[row.propertyName, row.unit].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}>
                      {row.priority}
                    </span>
                    <span className="text-xs text-muted">{displayWorkOrderCost(row.cost)}</span>
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
                </div>
              </button>
              {isExpanded ? (
                <div className="mt-3 border-t border-border pt-3">{renderRowDetail(row)}</div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className={PORTAL_DATA_TABLE}>
            <PortalDataTableColGroup percents={portalTableColumnPercents(4)} />
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
                      id={`portal-work-order-${row.id}`}
                      className={PORTAL_TABLE_TR_EXPANDABLE}
                      onClick={createPortalRowExpandClick(() =>
                        isExpanded ? setExpandedId(null) : openExpand(row),
                      )}
                      aria-expanded={isExpanded}
                    >
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
                        <PortalTableInlineExpand expanded={isExpanded}>{row.title}</PortalTableInlineExpand>
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
                          <span>{displayWorkOrderCost(row.cost)}</span>
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

      <Modal open={Boolean(approvePayRow)} onClose={() => setApprovePayRow(null)} title="Approve & pay">
        {approvePayRow ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {approvePayRow.propertyName} · {approvePayRow.title}
            </p>
            <p className="text-sm text-foreground">
              Pay{" "}
              <span className="font-semibold">
                $
                {(
                  (approvePayDefaults(approvePayRow).vendorCostCents + approvePayDefaults(approvePayRow).materialsCostCents) /
                  100
                ).toFixed(2)}
              </span>
              {approvePayRow.vendorName ? (
                <>
                  {" "}
                  to <span className="font-semibold">{approvePayRow.vendorName}</span>
                </>
              ) : null}
            </p>
            {approvePayRow.vendorMarkedDoneNote ? (
              <p className="text-xs text-muted">Vendor note: &ldquo;{approvePayRow.vendorMarkedDoneNote}&rdquo;</p>
            ) : null}
            <p className="text-xs text-muted">
              This logs the expense, marks the work order completed, and records the vendor as paid (bookkeeping
              only — no funds are transferred).
            </p>
            <div className="flex justify-start gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setApprovePayRow(null)} disabled={approvePayBusy}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                data-attr="work-order-approve-pay-confirm"
                onClick={() => void submitApprovePay(approvePayRow)}
                disabled={approvePayBusy}
              >
                {approvePayBusy ? "Approving…" : "Approve & pay"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
