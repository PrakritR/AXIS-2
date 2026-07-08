/**
 * Shared budget types + pure helpers. One row per property/fiscal-year/category
 * with a jsonb map of month index ("0".."11") → cents, matching the schema in
 * `20260712120000_manager_bills_ap.sql`. DB access lives in the `.server` twin.
 */
export type ManagerBudget = {
  id: string;
  propertyId: string | null;
  fiscalYear: number;
  categoryCode: string;
  monthlyAmountsCents: Record<string, number>;
  annualCents: number;
};

export const MANAGER_BUDGET_SELECT =
  "id, property_id, fiscal_year, category_code, monthly_amounts_cents, created_at";

/** Sum of the 12 monthly amounts (ignores non-numeric / extra keys defensively). */
export function annualBudgetCents(monthly: Record<string, number> | null | undefined): number {
  if (!monthly) return 0;
  let total = 0;
  for (const value of Object.values(monthly)) {
    const n = Number(value);
    if (Number.isFinite(n)) total += Math.round(n);
  }
  return total;
}

/**
 * Normalize a budget input into a 12-key monthly map. Accepts either an explicit
 * `{ "0": cents, ... }` map or a single `annualCents` split evenly across the
 * year (remainder pushed into December so the twelve months sum exactly).
 */
export function normalizeMonthlyAmounts(input: {
  monthlyAmountsCents?: Record<string, number> | null;
  annualCents?: number | null;
}): Record<string, number> {
  const out: Record<string, number> = {};
  if (input.monthlyAmountsCents && Object.keys(input.monthlyAmountsCents).length > 0) {
    for (let m = 0; m < 12; m++) {
      const raw = input.monthlyAmountsCents[String(m)];
      const n = Number(raw);
      out[String(m)] = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    }
    return out;
  }
  const annual = Math.max(0, Math.round(Number(input.annualCents ?? 0)));
  const base = Math.floor(annual / 12);
  for (let m = 0; m < 12; m++) out[String(m)] = base;
  out["11"] += annual - base * 12;
  return out;
}

export function mapManagerBudgetRow(row: Record<string, unknown>): ManagerBudget {
  const monthly = (row.monthly_amounts_cents ?? {}) as Record<string, number>;
  return {
    id: String(row.id),
    propertyId: row.property_id ? String(row.property_id) : null,
    fiscalYear: Number(row.fiscal_year),
    categoryCode: String(row.category_code),
    monthlyAmountsCents: monthly,
    annualCents: annualBudgetCents(monthly),
  };
}
