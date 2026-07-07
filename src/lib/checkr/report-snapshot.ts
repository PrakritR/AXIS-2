import type { CheckrAddOnSlug } from "@/lib/checkr/packages";
import type { CheckrReportSnapshot, CheckrResult } from "@/lib/checkr/types";

const PRODUCT_KEYS = [
  "criminal_history",
  "credit_report",
  "eviction_history",
  "identity_verification",
  "income_verification",
  "sex_offender_registry",
  "global_watchlist",
] as const;

export type CheckrReportProductKey = (typeof PRODUCT_KEYS)[number];

function productSnapshot(
  snapshot: CheckrReportSnapshot | undefined,
  key: CheckrReportProductKey,
): CheckrReportSnapshot[CheckrReportProductKey] {
  return snapshot?.[key] ?? undefined;
}

function productStatusFromSnapshot(
  snapshot: CheckrReportSnapshot | undefined,
  key: CheckrReportProductKey,
): string | undefined {
  return productSnapshot(snapshot, key)?.status;
}

/** Parse GET /orders/{id}/report into a compact snapshot safe to store on the application row. */
export function parseCheckrReportSnapshot(raw: Record<string, unknown> | null): CheckrReportSnapshot | undefined {
  if (!raw) return undefined;
  const snapshot: CheckrReportSnapshot = {};

  for (const key of PRODUCT_KEYS) {
    const product = raw[key] as { status?: string; consider_reasons?: string[] } | null | undefined;
    if (!product?.status) continue;
    snapshot[key] = {
      status: product.status,
      consider_reasons: Array.isArray(product.consider_reasons) ? product.consider_reasons : undefined,
    };
  }

  const creditScore = raw.credit_score;
  if (typeof creditScore === "number") snapshot.credit_score = creditScore;

  const income = raw.income_verification as { estimated_monthly_net_income_cents?: number } | null | undefined;
  if (typeof income?.estimated_monthly_net_income_cents === "number") {
    snapshot.est_monthly_income_cents = income.estimated_monthly_net_income_cents;
  }

  const credit = raw.credit_report as { estimated_monthly_payments_cents?: number } | null | undefined;
  if (typeof credit?.estimated_monthly_payments_cents === "number") {
    snapshot.est_monthly_payments_cents = credit.estimated_monthly_payments_cents;
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

/** Checkr Tenant test profiles (see Testing → Canned Provider Scenarios). */
const TEST_PROFILES: Array<{
  first: string;
  last: string;
  dob: string;
  ssn: string;
  products: Partial<Record<(typeof PRODUCT_KEYS)[number], string>>;
  income?: string;
  creditScore?: number;
}> = [
  {
    first: "Herbert",
    last: "Humphrey",
    dob: "1996-04-27",
    ssn: "111111111",
    creditScore: 715,
    products: {
      criminal_history: "consider",
      credit_report: "clear",
      eviction_history: "clear",
      income_verification: "consistent_income",
      sex_offender_registry: "clear",
      global_watchlist: "clear",
    },
  },
  {
    first: "Madelyn",
    last: "Webster",
    dob: "1996-04-27",
    ssn: "222222222",
    creditScore: 680,
    products: {
      criminal_history: "clear",
      credit_report: "consider",
      eviction_history: "clear",
      income_verification: "variable_income",
      sex_offender_registry: "clear",
      global_watchlist: "clear",
    },
  },
  {
    first: "Norma",
    last: "Davies",
    dob: "1996-04-27",
    ssn: "333333333",
    creditScore: 702,
    products: {
      criminal_history: "clear",
      credit_report: "clear",
      eviction_history: "consider",
      income_verification: "high_assets",
      sex_offender_registry: "clear",
      global_watchlist: "clear",
      identity_verification: "consider",
    },
  },
  {
    first: "Tim",
    last: "Watkins",
    dob: "1996-04-27",
    ssn: "444444444",
    creditScore: 640,
    products: {
      criminal_history: "consider",
      credit_report: "consider",
      eviction_history: "consider",
      income_verification: "low_assets",
      sex_offender_registry: "consider",
      global_watchlist: "consider",
      identity_verification: "consider",
    },
  },
];

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeDob(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.trim();
  return parsed.toISOString().slice(0, 10);
}

export function matchCheckrTestProfile(input: {
  firstName: string;
  lastName: string;
  dob: string | null;
  ssn: string;
}): (typeof TEST_PROFILES)[number] | null {
  const first = input.firstName.trim().toLowerCase();
  const last = input.lastName.trim().toLowerCase();
  const dob = normalizeDob(input.dob);
  const ssn = digits(input.ssn);
  return (
    TEST_PROFILES.find(
      (p) =>
        p.first.toLowerCase() === first &&
        p.last.toLowerCase() === last &&
        p.dob === dob &&
        digits(p.ssn) === ssn,
    ) ?? null
  );
}

/** Build a demo/test report snapshot from Checkr canned scenarios or SSN parity fallback. */
export function buildSimulatedReportSnapshot(input: {
  firstName: string;
  lastName: string;
  dob: string | null;
  ssn: string;
  packageSlug: string;
  addOnProducts?: CheckrAddOnSlug[];
}): CheckrReportSnapshot {
  const profile = matchCheckrTestProfile(input);
  const snapshot: CheckrReportSnapshot = {};

  const assign = (key: (typeof PRODUCT_KEYS)[number], status: string) => {
    snapshot[key] = { status };
  };

  if (profile) {
    for (const key of PRODUCT_KEYS) {
      const status = profile.products[key];
      if (status) assign(key, status);
    }
    if (profile.creditScore != null) snapshot.credit_score = profile.creditScore;
    snapshot.est_monthly_income_cents = 420000;
    snapshot.est_monthly_payments_cents = 7500;
  } else {
    const clear = Number(digits(input.ssn).slice(-1)) % 2 === 0;
    const status = clear ? "clear" : "consider";
    assign("criminal_history", status);
    assign("credit_report", status);
    assign("eviction_history", status);
    assign("sex_offender_registry", status);
    assign("global_watchlist", status);
    if (input.packageSlug === "complete") assign("income_verification", clear ? "consistent_income" : "low_assets");
    snapshot.credit_score = clear ? 715 : 640;
    snapshot.est_monthly_income_cents = clear ? 420000 : 310000;
    snapshot.est_monthly_payments_cents = 7500;
  }

  if (input.addOnProducts?.includes("identity_verification") && !snapshot.identity_verification) {
    assign("identity_verification", profile?.products.identity_verification ?? "clear");
  }

  if (input.packageSlug === "starter") {
    delete snapshot.credit_report;
    delete snapshot.eviction_history;
    delete snapshot.income_verification;
    delete snapshot.credit_score;
  } else if (input.packageSlug === "essential") {
    delete snapshot.income_verification;
  }

  return snapshot;
}

export function aggregateResultFromSnapshot(snapshot: CheckrReportSnapshot | undefined): CheckrResult {
  if (!snapshot) return null;
  let sawClear = false;
  for (const key of PRODUCT_KEYS) {
    const status = productStatusFromSnapshot(snapshot, key);
    if (!status) continue;
    if (status === "consider") return "consider";
    if (status === "clear") sawClear = true;
  }
  return sawClear ? "clear" : null;
}

export function countRecordsFromSnapshot(
  snapshot: CheckrReportSnapshot | undefined,
  key: CheckrReportProductKey,
): number {
  const status = productStatusFromSnapshot(snapshot, key);
  if (!status || status === "clear") return 0;
  return status === "consider" ? 1 : 0;
}
