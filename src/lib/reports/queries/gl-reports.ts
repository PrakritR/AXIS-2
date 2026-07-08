import type { SupabaseClient } from "@supabase/supabase-js";
import { chartAccountLabel } from "@/lib/reports/categories";
import { primeSystemChartOfAccounts, systemChartAccountByCode } from "@/lib/reports/chart-of-accounts-store";
import { centsToUsd } from "@/lib/reports/money";
import type { ManagerReportFilters, ReportResult } from "@/lib/reports/types";

function defaultDateRange(from?: string, to?: string): { from: string; to: string } {
  const now = new Date();
  const toDate = to?.trim() || now.toISOString().slice(0, 10);
  const fromDate = from?.trim() || new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  return { from: fromDate, to: toDate };
}

type JournalLineRow = {
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  memo?: string | null;
};

type JournalEntryRow = {
  id: string;
  entry_date: string;
  memo: string | null;
  source_type: string;
  source_id: string;
  property_id: string | null;
  gl_journal_lines: JournalLineRow[] | null;
};

function accountBalanceCents(accountCode: string, debitTotal: number, creditTotal: number): number {
  const acct = systemChartAccountByCode(accountCode);
  const normal = acct?.normalBalance ?? "debit";
  return normal === "credit" ? creditTotal - debitTotal : debitTotal - creditTotal;
}

async function loadJournalEntriesThrough(
  db: SupabaseClient,
  managerUserId: string,
  to: string,
  propertyId?: string,
): Promise<JournalEntryRow[]> {
  let query = db
    .from("gl_journal_entries")
    .select("id, entry_date, memo, source_type, source_id, property_id, gl_journal_lines(account_code, debit_cents, credit_cents)")
    .eq("manager_user_id", managerUserId)
    .eq("is_reversal", false)
    .lte("entry_date", to)
    .order("entry_date", { ascending: true })
    .limit(5000);

  if (propertyId) query = query.eq("property_id", propertyId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as JournalEntryRow[] | null) ?? [];
}

function aggregateAccountTotals(entries: JournalEntryRow[]): Map<string, { debits: number; credits: number }> {
  const totals = new Map<string, { debits: number; credits: number }>();
  for (const entry of entries) {
    for (const line of entry.gl_journal_lines ?? []) {
      const code = String(line.account_code);
      const cur = totals.get(code) ?? { debits: 0, credits: 0 };
      cur.debits += Number(line.debit_cents);
      cur.credits += Number(line.credit_cents);
      totals.set(code, cur);
    }
  }
  return totals;
}

export async function queryTrialBalance(
  db: SupabaseClient,
  managerUserId: string,
  filters: ManagerReportFilters,
): Promise<ReportResult> {
  await primeSystemChartOfAccounts(db);
  const { to } = defaultDateRange(filters.from, filters.to);

  const entries = await loadJournalEntriesThrough(db, managerUserId, to, filters.propertyId);
  const totals = aggregateAccountTotals(entries);

  const rows: Record<string, string | number | boolean | null>[] = [];
  let totalDebits = 0;
  let totalCredits = 0;

  for (const [code, sums] of [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (sums.debits === 0 && sums.credits === 0) continue;
    totalDebits += sums.debits;
    totalCredits += sums.credits;
    const balance = accountBalanceCents(code, sums.debits, sums.credits);
    rows.push({
      account: chartAccountLabel(code),
      accountCode: code,
      debit: centsToUsd(sums.debits),
      credit: centsToUsd(sums.credits),
      balance: centsToUsd(balance),
    });
  }

  return {
    id: "trial-balance",
    title: "Trial Balance",
    columns: [
      { key: "account", label: "Account" },
      { key: "debit", label: "Debits", align: "right", format: "money" },
      { key: "credit", label: "Credits", align: "right", format: "money" },
      { key: "balance", label: "Balance", align: "right", format: "money" },
    ],
    rows,
    totals: {
      account: "Totals",
      debit: centsToUsd(totalDebits),
      credit: centsToUsd(totalCredits),
      balance: centsToUsd(totalDebits - totalCredits),
    },
    meta: {
      asOf: to,
      balanced: totalDebits === totalCredits,
      totalDebits: centsToUsd(totalDebits),
      totalCredits: centsToUsd(totalCredits),
    },
  };
}

export async function queryBalanceSheet(
  db: SupabaseClient,
  managerUserId: string,
  filters: ManagerReportFilters,
): Promise<ReportResult> {
  await primeSystemChartOfAccounts(db);
  const { to } = defaultDateRange(filters.from, filters.to);

  const entries = await loadJournalEntriesThrough(db, managerUserId, to, filters.propertyId);
  const totals = aggregateAccountTotals(entries);

  const rows: Record<string, string | number | boolean | null>[] = [];
  let assetTotal = 0;
  let liabilityTotal = 0;
  let equityTotal = 0;

  for (const [code, sums] of [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const acct = systemChartAccountByCode(code);
    const type = acct?.accountType;
    if (!type || !["asset", "liability", "equity"].includes(type)) continue;
    const balance = accountBalanceCents(code, sums.debits, sums.credits);
    if (balance === 0) continue;

    if (type === "asset") assetTotal += balance;
    else if (type === "liability") liabilityTotal += balance;
    else equityTotal += balance;

    rows.push({
      section: type === "asset" ? "Assets" : type === "liability" ? "Liabilities" : "Equity",
      account: chartAccountLabel(code),
      amount: centsToUsd(balance),
    });
  }

  rows.sort((a, b) => `${a.section}-${a.account}`.localeCompare(`${b.section}-${b.account}`));

  rows.push({
    section: "",
    account: "Total liabilities + equity",
    amount: centsToUsd(liabilityTotal + equityTotal),
    _isTotal: true,
  });

  return {
    id: "balance-sheet",
    title: "Balance Sheet",
    columns: [
      { key: "section", label: "Section" },
      { key: "account", label: "Account" },
      { key: "amount", label: "Amount", align: "right", format: "money" },
    ],
    rows,
    meta: {
      asOf: to,
      assets: centsToUsd(assetTotal),
      liabilities: centsToUsd(liabilityTotal),
      equity: centsToUsd(equityTotal),
      balanced: assetTotal === liabilityTotal + equityTotal,
    },
  };
}

export async function queryGeneralLedger(
  db: SupabaseClient,
  managerUserId: string,
  filters: ManagerReportFilters,
): Promise<ReportResult> {
  await primeSystemChartOfAccounts(db);
  const { from, to } = defaultDateRange(filters.from, filters.to);

  let query = db
    .from("gl_journal_entries")
    .select(
      "id, entry_date, memo, source_type, source_id, property_id, gl_journal_lines(account_code, debit_cents, credit_cents, memo)",
    )
    .eq("manager_user_id", managerUserId)
    .eq("is_reversal", false)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date", { ascending: true })
    .limit(5000);

  if (filters.propertyId) query = query.eq("property_id", filters.propertyId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows: Record<string, string | number | boolean | null>[] = [];
  for (const entry of (data as JournalEntryRow[] | null) ?? []) {
    for (const line of entry.gl_journal_lines ?? []) {
      rows.push({
        date: entry.entry_date,
        source: entry.source_type,
        sourceId: entry.source_id,
        account: chartAccountLabel(line.account_code),
        memo: line.memo ?? entry.memo ?? "",
        debit: Number(line.debit_cents) > 0 ? centsToUsd(line.debit_cents) : "",
        credit: Number(line.credit_cents) > 0 ? centsToUsd(line.credit_cents) : "",
      });
    }
  }

  return {
    id: "general-ledger",
    title: "General Ledger",
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "account", label: "Account" },
      { key: "memo", label: "Memo" },
      { key: "debit", label: "Debit", align: "right", format: "money" },
      { key: "credit", label: "Credit", align: "right", format: "money" },
      { key: "source", label: "Source" },
    ],
    rows,
    meta: { from, to },
  };
}

const CASH_ACCOUNTS = new Set([
  "operating_cash",
  "trust_account_rental_ops",
  "trust_account_security_deposits",
]);

export async function queryCashFlowStatement(
  db: SupabaseClient,
  managerUserId: string,
  filters: ManagerReportFilters,
): Promise<ReportResult> {
  await primeSystemChartOfAccounts(db);
  const { from, to } = defaultDateRange(filters.from, filters.to);

  let query = db
    .from("gl_journal_entries")
    .select("entry_date, gl_journal_lines(account_code, debit_cents, credit_cents)")
    .eq("manager_user_id", managerUserId)
    .eq("is_reversal", false)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .limit(5000);

  if (filters.propertyId) query = query.eq("property_id", filters.propertyId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let inflows = 0;
  let outflows = 0;

  for (const entry of (data as JournalEntryRow[] | null) ?? []) {
    for (const line of entry.gl_journal_lines ?? []) {
      if (!CASH_ACCOUNTS.has(line.account_code)) continue;
      inflows += Number(line.debit_cents);
      outflows += Number(line.credit_cents);
    }
  }

  const net = inflows - outflows;

  return {
    id: "cash-flow-statement",
    title: "Cash Flow Statement",
    columns: [
      { key: "line", label: "Line" },
      { key: "amount", label: "Amount", align: "right", format: "money" },
    ],
    rows: [
      { line: "Cash inflows", amount: centsToUsd(inflows) },
      { line: "Cash outflows", amount: centsToUsd(outflows) },
      { line: "Net cash change", amount: centsToUsd(net), _isTotal: true },
    ],
    meta: {
      from,
      to,
      note: "Simplified cash-basis view from bank/trust GL accounts; accrual adjustments land in a later phase.",
      netCash: centsToUsd(net),
    },
  };
}

export async function queryPayoutHistory(
  db: SupabaseClient,
  managerUserId: string,
  filters: ManagerReportFilters,
): Promise<ReportResult> {
  const { from, to } = defaultDateRange(filters.from, filters.to);

  const { data, error } = await db
    .from("stripe_payouts")
    .select("stripe_payout_id, amount_cents, currency, status, arrival_date, failure_message, created_at")
    .eq("manager_user_id", managerUserId)
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lte("created_at", `${to}T23:59:59.999Z`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((row) => ({
    date: String(row.created_at ?? "").slice(0, 10),
    payoutId: row.stripe_payout_id,
    amount: centsToUsd(Number(row.amount_cents)),
    status: row.status,
    arrivalDate: row.arrival_date ?? "",
    note: row.failure_message ?? "",
  }));

  return {
    id: "payout-history",
    title: "Payout History",
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "payoutId", label: "Payout ID" },
      { key: "amount", label: "Amount", align: "right", format: "money" },
      { key: "status", label: "Status" },
      { key: "arrivalDate", label: "Arrival", format: "date" },
      { key: "note", label: "Note" },
    ],
    rows,
    meta: { from, to, count: rows.length },
  };
}
