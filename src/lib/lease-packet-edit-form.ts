import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { parseMoneyAmount } from "@/lib/parse-money";
import { computeLeaseEndDate, normalizeIsoDateInput, shouldAutoComputeLeaseEnd } from "@/lib/rental-application/lease-dates";
import { LEASE_TERM_OPTIONS, SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/lease-terms";
import {
  applicationPatchFromLeasePacketInput,
  type UpdateLeasePacketInput,
} from "@/lib/tools/domains/leases-logic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type LeasePacketFormValues = {
  unit: string;
  roomChoice: string;
  rentalType: "standard" | "short_term";
  leaseTerm: string;
  leaseStart: string;
  leaseEnd: string;
  monthlyRent: string;
  monthlyUtilities: string;
  securityDeposit: string;
  moveInFee: string;
  notes: string;
};

export const LEASE_PACKET_TERM_OPTIONS = [...LEASE_TERM_OPTIONS, SHORT_TERM_LEASE_TERM] as const;

function moneyInputFromLabel(label: string | undefined | null): string {
  const trimmed = String(label ?? "").trim();
  if (!trimmed) return "";
  const n = parseMoneyAmount(trimmed);
  return n > 0 ? String(n) : "";
}

export function leasePacketFormValuesFromRow(row: LeasePipelineRow): LeasePacketFormValues {
  const app = row.application ?? {};
  const rentalType = app.rentalType === "short_term" ? "short_term" : "standard";
  return {
    unit: row.unit?.trim() ?? "",
    roomChoice: (app.roomChoice1 ?? row.roomChoice ?? "").trim(),
    rentalType,
    leaseTerm: String(app.leaseTerm ?? "").trim(),
    leaseStart: normalizeIsoDateInput(app.leaseStart),
    leaseEnd: normalizeIsoDateInput(app.leaseEnd),
    monthlyRent: moneyInputFromLabel(app.managerRentOverride),
    monthlyUtilities: moneyInputFromLabel(app.managerUtilitiesOverride),
    securityDeposit: moneyInputFromLabel(app.managerSecurityDepositOverride),
    moveInFee: moneyInputFromLabel(app.managerMoveInFeeOverride),
    notes: row.notes?.trim() ?? "",
  };
}

export function leasePacketFormValuesEqual(a: LeasePacketFormValues, b: LeasePacketFormValues): boolean {
  return (Object.keys(a) as (keyof LeasePacketFormValues)[]).every((k) => a[k] === b[k]);
}

export function leasePacketFormAutoLeaseEnd(values: LeasePacketFormValues): string {
  if (!shouldAutoComputeLeaseEnd(values.leaseTerm, values.rentalType)) return values.leaseEnd;
  return computeLeaseEndDate(values.leaseStart, values.leaseTerm) || values.leaseEnd;
}

export function leasePacketFormRegeneratesDocument(before: LeasePacketFormValues, after: LeasePacketFormValues): boolean {
  const keys: (keyof LeasePacketFormValues)[] = [
    "roomChoice",
    "rentalType",
    "leaseTerm",
    "leaseStart",
    "leaseEnd",
    "monthlyRent",
    "monthlyUtilities",
    "securityDeposit",
    "moveInFee",
  ];
  return keys.some((k) => before[k] !== after[k]);
}

function parseOptionalMoney(raw: string, label: string): number | undefined | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = parseMoneyAmount(trimmed);
  if (!Number.isFinite(n) || n < 0) return { error: `${label} must be a valid dollar amount.` };
  return n;
}

export function buildLeasePacketUpdateFromForm(
  leaseId: string,
  values: LeasePacketFormValues,
  baseline: LeasePacketFormValues,
): { ok: true; input: UpdateLeasePacketInput } | { ok: false; error: string } {
  if (leasePacketFormValuesEqual(values, baseline)) {
    return { ok: false, error: "No changes to save." };
  }

  const input: UpdateLeasePacketInput = { leaseId };
  const setIfChanged = <K extends keyof LeasePacketFormValues>(key: K, apply: (v: string) => void) => {
    if (values[key] !== baseline[key]) apply(values[key]);
  };

  setIfChanged("unit", (v) => {
    input.unit = v.trim();
  });
  setIfChanged("notes", (v) => {
    input.notes = v.trim();
  });
  setIfChanged("roomChoice", (v) => {
    input.roomChoice = v.trim();
  });
  setIfChanged("rentalType", (v) => {
    input.rentalType = v as LeasePacketFormValues["rentalType"];
  });
  setIfChanged("leaseTerm", (v) => {
    input.leaseTerm = v.trim();
  });
  if (values.leaseStart !== baseline.leaseStart) {
    const start = values.leaseStart.trim();
    if (start && !DATE_RE.test(start)) {
      return { ok: false, error: "Lease start must use YYYY-MM-DD." };
    }
    input.leaseStart = start;
  }
  setIfChanged("leaseEnd", (v) => {
    input.leaseEnd = v.trim();
  });

  const moneyFields = [
    ["monthlyRent", "Monthly rent"] as const,
    ["monthlyUtilities", "Monthly utilities"] as const,
    ["securityDeposit", "Security deposit"] as const,
    ["moveInFee", "Move-in fee"] as const,
  ];
  for (const [key, label] of moneyFields) {
    if (values[key] === baseline[key]) continue;
    const parsed = parseOptionalMoney(values[key], label);
    if (parsed && typeof parsed === "object" && "error" in parsed) return { ok: false, error: parsed.error };
    if (parsed !== undefined) {
      if (key === "monthlyRent") input.monthlyRent = parsed;
      else if (key === "monthlyUtilities") input.monthlyUtilities = parsed;
      else if (key === "securityDeposit") input.securityDeposit = parsed;
      else input.moveInFee = parsed;
    }
  }

  if (input.leaseStart && !DATE_RE.test(input.leaseStart)) {
    return { ok: false, error: "Lease start must use YYYY-MM-DD." };
  }
  if (input.leaseEnd !== undefined && input.leaseEnd && !DATE_RE.test(input.leaseEnd)) {
    return { ok: false, error: "Lease end must use YYYY-MM-DD or be left empty for month-to-month." };
  }

  const hasScalar =
    input.unit !== undefined ||
    input.notes !== undefined ||
    input.monthlyRent !== undefined ||
    input.monthlyUtilities !== undefined ||
    input.securityDeposit !== undefined ||
    input.moveInFee !== undefined ||
    input.leaseStart !== undefined ||
    input.leaseEnd !== undefined ||
    input.leaseTerm !== undefined ||
    input.roomChoice !== undefined ||
    input.rentalType !== undefined;
  if (!hasScalar) return { ok: false, error: "No changes to save." };

  if (applicationPatchFromLeasePacketInput(input) === null && input.unit === undefined && input.notes === undefined) {
    return { ok: false, error: "No changes to save." };
  }

  return { ok: true, input };
}
