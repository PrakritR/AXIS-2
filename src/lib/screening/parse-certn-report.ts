import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ScreeningCreditRating,
  ScreeningOrderStatus,
  ScreeningProviderReport,
} from "@/lib/screening/types";
import { creditRatingFromScore } from "@/lib/screening/recommendation";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapVendorStatus(payload: Record<string, unknown>): ScreeningOrderStatus {
  const reportStatus = asString(payload.report_status)?.toUpperCase() ?? "";
  const orderStatus = asString(payload.order_status)?.toUpperCase() ?? "";
  const status = reportStatus || orderStatus;
  if (status === "COMPLETE" || status === "COMPLETED" || status === "RETURNED") return "complete";
  if (status === "FAILED" || status === "ERROR") return "failed";
  if (status === "CANCELED" || status === "CANCELLED") return "canceled";
  if (status === "PENDING" || status === "SUBMITTED" || status === "IN_PROGRESS" || status === "PROCESSING") {
    return "in_progress";
  }
  if (payload.is_submitted === true) return "in_progress";
  return "queued";
}

function countCriminalFlags(payload: Record<string, unknown>): number {
  const us = asRecord(payload.us_criminal_record_check_result);
  if (!us) return 0;
  const cases = Array.isArray(us.criminal_cases) ? us.criminal_cases.length : 0;
  const details = Array.isArray(us.record_check_details) ? us.record_check_details.length : 0;
  const result = asString(us.result)?.toUpperCase() ?? "";
  if (cases > 0 || details > 0) return Math.max(cases, details, 1);
  if (result && result !== "NONE" && result !== "CLEARED" && result !== "CLEAR") return 1;
  return 0;
}

function countEvictionFlags(payload: Record<string, unknown>, equifax: Record<string, unknown> | null): number {
  let flags = 0;
  const trades = Array.isArray(equifax?.trades) ? equifax.trades : [];
  for (const trade of trades) {
    const row = asRecord(trade);
    const label = `${asString(row?.account_type) ?? ""} ${asString(row?.description) ?? ""}`.toLowerCase();
    if (label.includes("evict") || label.includes("collection")) flags += 1;
  }
  const soft = asRecord(payload.softcheck_result);
  const possible = Array.isArray(soft?.possible_matches) ? soft.possible_matches.length : 0;
  if (possible > 0) flags += possible;
  return flags;
}

export function parseCertnReportPayload(payload: unknown): ScreeningProviderReport | null {
  const root = asRecord(payload);
  if (!root) return null;
  const externalOrderId = asString(root.id);
  if (!externalOrderId) return null;

  const equifax = asRecord(root.equifax_result);
  const creditScore = asNumber(equifax?.credit_score);
  const creditRating: ScreeningCreditRating = creditRatingFromScore(creditScore);
  const criminalFlags = countCriminalFlags(root);
  const evictionFlags = countEvictionFlags(root, equifax);
  const applicant = asRecord(root.applicant);
  const reportUrl = asString(applicant?.report_url) ?? asString(root.report_url);

  const employment = asRecord(root.employment_verification_result);
  const incomeVerified =
    asString(employment?.result)?.toUpperCase() === "CLEARED" ||
    asString(employment?.status)?.toUpperCase() === "COMPLETE";

  return {
    externalOrderId,
    status: mapVendorStatus(root),
    creditScore,
    creditRating,
    criminalFlags,
    evictionFlags,
    incomeVerified,
    reportUrl: reportUrl ?? undefined,
    rawResult: asString(root.result),
    rawResultLabel: asString(root.result_label) ?? asString(root.certn_score_label),
  };
}

export function verifyCertnWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string | null): boolean {
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signatureHeader?.trim()) return false;

  const parts = signatureHeader.split(",");
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = value ?? null;
    if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return signatures.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}
