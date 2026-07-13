/**
 * Client-safe dispatch types + pure guardrail evaluation. The server pipeline
 * (prepare/execute/notify) lives in work-order-dispatch.server.ts; the manager
 * panel renders proposal state from these same types.
 */
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { VendorDispatchSettings } from "@/lib/vendor-dispatch-settings";

export type WorkOrderDispatchStatus = "proposed" | "approved" | "auto_dispatched" | "declined";

export type DispatchGuardrailResult = {
  /** Candidate is on the manager's approved list (or no list is set). */
  approvedList: boolean;
  /** Work order category is allowed for auto mode (or no category filter is set). */
  category: boolean;
  /** Most dispatches have no cost yet — "no_estimate" is the normal case, not a failure. */
  spendCap: "pass" | "over_cap" | "no_estimate";
};

export type WorkOrderDispatch = {
  status: WorkOrderDispatchStatus;
  vendorId: string;
  vendorName: string;
  /** Human-readable match reason from the deterministic matcher. */
  reasoning: string;
  /** Top candidates shown to the manager alongside the pick. */
  candidates: { vendorId: string; vendorName: string; reason: string }[];
  guardrails: DispatchGuardrailResult;
  proposedAtIso: string;
  decidedAtIso?: string;
  decidedBy?: "manager" | "auto";
};

/**
 * The dispatch key rides on row_data as a server-owned extension of the base
 * row type — dispatch-aware code (pipeline, proposal card, sync guard) uses
 * this alias instead of widening DemoManagerWorkOrderRow for every consumer.
 */
export type WorkOrderRowWithDispatch = DemoManagerWorkOrderRow & { dispatch?: WorkOrderDispatch };

type EstimateFields = Pick<DemoManagerWorkOrderRow, "category" | "vendorCostCents" | "cost">;

function workOrderEstimateCents(workOrder: EstimateFields): number | null {
  if (typeof workOrder.vendorCostCents === "number" && workOrder.vendorCostCents > 0) {
    return workOrder.vendorCostCents;
  }
  const parsed = Number(String(workOrder.cost ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
}

export function evaluateDispatchGuardrails(
  settings: VendorDispatchSettings,
  workOrder: EstimateFields,
  candidate: { vendorId: string },
): DispatchGuardrailResult {
  const approvedList =
    !settings.approvedVendorIds || settings.approvedVendorIds.includes(candidate.vendorId);
  const category =
    !settings.categories || (workOrder.category != null && settings.categories.includes(workOrder.category));
  const estimateCents = workOrderEstimateCents(workOrder);
  const spendCap =
    estimateCents == null
      ? "no_estimate"
      : settings.spendCapCents != null && estimateCents > settings.spendCapCents
        ? "over_cap"
        : "pass";
  return { approvedList, category, spendCap };
}

/** Whether full-auto mode may execute this candidate without manager approval. */
export function guardrailsAllowAutoDispatch(guardrails: DispatchGuardrailResult): boolean {
  return guardrails.approvedList && guardrails.category && guardrails.spendCap !== "over_cap";
}

const EMERGENCY_KEYWORDS = /\b(flood|flooding|leak|leaking|gas|burst|sewage|no heat|no power|fire|sparking)\b/i;

/** Urgency signal for notification copy only — auto-dispatch behavior is identical. */
export function isEmergencyWorkOrder(
  row: Pick<DemoManagerWorkOrderRow, "priority" | "title" | "description" | "category">,
): boolean {
  if (/\b(emergency|urgent)\b/i.test(row.priority ?? "")) return true;
  if (row.category !== "plumbing" && row.category !== "hvac" && row.category !== "electrical") return false;
  return EMERGENCY_KEYWORDS.test(`${row.title ?? ""} ${row.description ?? ""}`);
}
