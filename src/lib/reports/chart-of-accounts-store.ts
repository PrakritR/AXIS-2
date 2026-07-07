import type { SupabaseClient } from "@supabase/supabase-js";

export type ChartAccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type ChartAccountRow = {
  code: string;
  name: string;
  accountType: ChartAccountType;
  accountNumber: number | null;
  normalBalance: "debit" | "credit" | null;
  parentCode: string | null;
  isBankAccount: boolean;
  isTrustAccount: boolean;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  scheduleELine?: number;
  scheduleERef?: string;
  scheduleELabel?: string;
  /** Tax classification for expense accounts: deductible on Schedule E vs non-deductible. Rule-derived (see deductibleForAccount), not a DB column. */
  deductible?: boolean;
};

type ChartAccountDbRow = {
  code: string;
  name: string;
  account_type: string;
  account_number: number | null;
  normal_balance: string | null;
  parent_code: string | null;
  is_bank_account: boolean;
  is_trust_account: boolean;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  schedule_e_line: number | null;
  schedule_e_ref: string | null;
  schedule_e_label: string | null;
};

const CHART_ACCOUNT_COLUMNS =
  "code, name, account_type, account_number, normal_balance, parent_code, is_bank_account, is_trust_account, is_active, is_system, sort_order, schedule_e_line, schedule_e_ref, schedule_e_label";

/** Non-deductible expense codes (Schedule E rule-based classification exception). */
const NON_DEDUCTIBLE_EXPENSE_CODES = new Set(["capital_improvement"]);

function deductibleForAccount(accountType: string, code: string): boolean | undefined {
  if (accountType !== "expense") return undefined;
  return !NON_DEDUCTIBLE_EXPENSE_CODES.has(code);
}

function mapRow(row: ChartAccountDbRow): ChartAccountRow {
  return {
    code: row.code,
    name: row.name,
    accountType: row.account_type as ChartAccountType,
    accountNumber: row.account_number,
    normalBalance: (row.normal_balance as "debit" | "credit" | null) ?? null,
    parentCode: row.parent_code,
    isBankAccount: row.is_bank_account,
    isTrustAccount: row.is_trust_account,
    isActive: row.is_active,
    isSystem: row.is_system,
    sortOrder: row.sort_order,
    scheduleELine: row.schedule_e_line ?? undefined,
    scheduleERef: row.schedule_e_ref ?? undefined,
    scheduleELabel: row.schedule_e_label ?? undefined,
    deductible: deductibleForAccount(row.account_type, row.code),
  };
}

/**
 * Defense-in-depth only — used when the chart_of_accounts DB read fails. The
 * DB table (seeded in supabase/migrations/20260710090000_chart_of_accounts_double_entry.sql)
 * is the runtime source of truth; keep this in sync with that seed data.
 * `deductible` is filled in below via deductibleForAccount (rule-derived, not authored per-row).
 */
const SYSTEM_CHART_ACCOUNTS_RAW: Omit<ChartAccountRow, "deductible">[] = [
  { code: "operating_cash", name: "Operating Cash", accountType: "asset", accountNumber: 1000, normalBalance: "debit", parentCode: null, isBankAccount: true, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 5 },
  { code: "trust_account_rental_ops", name: "Trust Account — Rental Operations", accountType: "asset", accountNumber: 1010, normalBalance: "debit", parentCode: null, isBankAccount: true, isTrustAccount: true, isActive: true, isSystem: true, sortOrder: 6 },
  { code: "trust_account_security_deposits", name: "Trust Account — Security Deposits", accountType: "asset", accountNumber: 1020, normalBalance: "debit", parentCode: null, isBankAccount: true, isTrustAccount: true, isActive: true, isSystem: true, sortOrder: 7 },
  { code: "accounts_receivable", name: "Accounts Receivable", accountType: "asset", accountNumber: 1100, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 8 },
  { code: "accounts_payable", name: "Accounts Payable", accountType: "liability", accountNumber: 2000, normalBalance: "credit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 9 },
  { code: "security_deposit_liability", name: "Security Deposits Held", accountType: "liability", accountNumber: 2010, normalBalance: "credit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 13 },
  { code: "owners_equity", name: "Owner's Equity", accountType: "equity", accountNumber: 3000, normalBalance: "credit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 11 },
  { code: "retained_earnings", name: "Retained Earnings", accountType: "equity", accountNumber: 3010, normalBalance: "credit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 12 },
  { code: "rent_income", name: "Rent Income", accountType: "income", accountNumber: 4000, normalBalance: "credit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 10, scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "late_fees", name: "Late Fees", accountType: "income", accountNumber: 4010, normalBalance: "credit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 20, scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "pet_rent", name: "Pet Rent", accountType: "income", accountNumber: 4020, normalBalance: "credit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 30, scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "application_fee", name: "Application Fee", accountType: "income", accountNumber: 4030, normalBalance: "credit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 40, scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "other_income", name: "Other Income", accountType: "income", accountNumber: 4040, normalBalance: "credit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 50, scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "nsf_fees", name: "NSF Fees", accountType: "income", accountNumber: 4050, normalBalance: "credit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 45, scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "maintenance", name: "Maintenance", accountType: "expense", accountNumber: 5000, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 110, scheduleELine: 14, scheduleERef: "Sch. E, Line 14", scheduleELabel: "Repairs" },
  { code: "cleaning", name: "Cleaning", accountType: "expense", accountNumber: 5010, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 112, scheduleELine: 7, scheduleERef: "Sch. E, Line 7", scheduleELabel: "Cleaning and Maintenance" },
  { code: "plumbing", name: "Plumbing", accountType: "expense", accountNumber: 5020, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 113, scheduleELine: 14, scheduleERef: "Sch. E, Line 14", scheduleELabel: "Repairs" },
  { code: "mold_remediation", name: "Mold Remediation", accountType: "expense", accountNumber: 5030, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 114, scheduleELine: 14, scheduleERef: "Sch. E, Line 14", scheduleELabel: "Repairs" },
  { code: "materials", name: "Materials / Equipment", accountType: "expense", accountNumber: 5040, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 116, scheduleELine: 15, scheduleERef: "Sch. E, Line 15", scheduleELabel: "Supplies" },
  { code: "mortgage", name: "Mortgage", accountType: "expense", accountNumber: 5050, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 105, scheduleELine: 12, scheduleERef: "Sch. E, Line 12", scheduleELabel: "Mortgage Interest" },
  { code: "utilities", name: "Utilities", accountType: "expense", accountNumber: 5060, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 120, scheduleELine: 17, scheduleERef: "Sch. E, Line 17", scheduleELabel: "Utilities" },
  { code: "electricity", name: "Electricity", accountType: "expense", accountNumber: 5070, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 121, scheduleELine: 17, scheduleERef: "Sch. E, Line 17", scheduleELabel: "Utilities" },
  { code: "heating", name: "Heating / HVAC", accountType: "expense", accountNumber: 5080, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 122, scheduleELine: 17, scheduleERef: "Sch. E, Line 17", scheduleELabel: "Utilities" },
  { code: "wifi", name: "Wi‑Fi / Internet", accountType: "expense", accountNumber: 5090, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 123, scheduleELine: 17, scheduleERef: "Sch. E, Line 17", scheduleELabel: "Utilities" },
  { code: "property_tax", name: "Property Tax", accountType: "expense", accountNumber: 5100, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 125, scheduleELine: 16, scheduleERef: "Sch. E, Line 16", scheduleELabel: "Taxes" },
  { code: "taxes", name: "Taxes", accountType: "expense", accountNumber: 5110, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 130, scheduleELine: 16, scheduleERef: "Sch. E, Line 16", scheduleELabel: "Taxes" },
  { code: "insurance", name: "Insurance", accountType: "expense", accountNumber: 5120, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 140, scheduleELine: 9, scheduleERef: "Sch. E, Line 9", scheduleELabel: "Insurance" },
  { code: "management", name: "Management", accountType: "expense", accountNumber: 5130, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 150, scheduleELine: 11, scheduleERef: "Sch. E, Line 11", scheduleELabel: "Management Fees" },
  { code: "service_fees", name: "Service Fees", accountType: "expense", accountNumber: 5140, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 155, scheduleELine: 10, scheduleERef: "Sch. E, Line 10", scheduleELabel: "Legal and Professional Fees" },
  { code: "other_expense", name: "Other Expense", accountType: "expense", accountNumber: 5150, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 160, scheduleELine: 19, scheduleERef: "Sch. E, Line 19", scheduleELabel: "Other" },
  { code: "capital_improvement", name: "Capital Improvement", accountType: "expense", accountNumber: 5160, normalBalance: "debit", parentCode: null, isBankAccount: false, isTrustAccount: false, isActive: true, isSystem: true, sortOrder: 135, scheduleERef: "Capitalize (Form 4562)", scheduleELabel: "Capital Improvements" },
];

export const SYSTEM_CHART_ACCOUNTS_FALLBACK: ChartAccountRow[] = SYSTEM_CHART_ACCOUNTS_RAW.map((a) => ({
  ...a,
  deductible: deductibleForAccount(a.accountType, a.code),
}));

const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry = { rows: ChartAccountRow[]; expiresAt: number };

let systemCacheEntry: CacheEntry | null = null;
const managerOverrideCache = new Map<string, CacheEntry>();

/** Synchronous lookup backing chartAccountLabel/chartAccountScheduleE/isCategoryDeductible in categories.ts — system accounts only, warmed by getChartOfAccounts/primeSystemChartOfAccounts. */
let systemLookup: Map<string, ChartAccountRow> = new Map(
  SYSTEM_CHART_ACCOUNTS_FALLBACK.map((a) => [a.code, a]),
);

async function fetchAccounts(db: SupabaseClient, managerUserId: string | null): Promise<ChartAccountRow[]> {
  let query = db.from("chart_of_accounts").select(CHART_ACCOUNT_COLUMNS).order("sort_order", { ascending: true });
  query = managerUserId ? query.eq("manager_user_id", managerUserId) : query.is("manager_user_id", null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as ChartAccountDbRow));
}

/**
 * System accounts (manager_user_id is null) + this manager's overrides
 * (a manager override with the same code replaces the system row). Falls
 * back to SYSTEM_CHART_ACCOUNTS_FALLBACK if the DB read fails, so a Supabase
 * outage degrades reports rather than 500ing them. Cached per-request-burst
 * (module-level, TTL'd) to avoid re-querying per report row.
 */
export async function getChartOfAccounts(
  db: SupabaseClient,
  managerUserId?: string | null,
): Promise<ChartAccountRow[]> {
  const now = Date.now();
  let systemRows: ChartAccountRow[];
  try {
    if (systemCacheEntry && systemCacheEntry.expiresAt > now) {
      systemRows = systemCacheEntry.rows;
    } else {
      systemRows = await fetchAccounts(db, null);
      systemCacheEntry = { rows: systemRows, expiresAt: now + CACHE_TTL_MS };
      systemLookup = new Map(systemRows.map((a) => [a.code, a]));
    }
  } catch {
    systemRows = SYSTEM_CHART_ACCOUNTS_FALLBACK;
  }

  if (!managerUserId) return systemRows;

  let overrides: ChartAccountRow[];
  try {
    const cached = managerOverrideCache.get(managerUserId);
    if (cached && cached.expiresAt > now) {
      overrides = cached.rows;
    } else {
      overrides = await fetchAccounts(db, managerUserId);
      managerOverrideCache.set(managerUserId, { rows: overrides, expiresAt: now + CACHE_TTL_MS });
    }
  } catch {
    overrides = [];
  }

  if (overrides.length === 0) return systemRows;
  const byCode = new Map(systemRows.map((a) => [a.code, a]));
  for (const o of overrides) byCode.set(o.code, o);
  return [...byCode.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Warms the system-account cache backing the synchronous helpers in categories.ts. Safe to call redundantly. */
export async function primeSystemChartOfAccounts(db: SupabaseClient): Promise<void> {
  await getChartOfAccounts(db, null);
}

export function systemChartAccountByCode(code: string): ChartAccountRow | undefined {
  return systemLookup.get(code) ?? SYSTEM_CHART_ACCOUNTS_FALLBACK.find((a) => a.code === code);
}

export function resetChartOfAccountsCacheForTests(): void {
  systemCacheEntry = null;
  managerOverrideCache.clear();
  systemLookup = new Map(SYSTEM_CHART_ACCOUNTS_FALLBACK.map((a) => [a.code, a]));
}
