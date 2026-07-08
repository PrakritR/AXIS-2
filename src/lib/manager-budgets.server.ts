import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapManagerBudgetRow,
  normalizeMonthlyAmounts,
  MANAGER_BUDGET_SELECT,
  type ManagerBudget,
} from "@/lib/manager-budgets";

export type UpsertManagerBudgetInput = {
  managerUserId: string;
  propertyId?: string | null;
  fiscalYear: number;
  categoryCode: string;
  monthlyAmountsCents?: Record<string, number> | null;
  annualCents?: number | null;
};

/**
 * Create or update a single property/year/category budget row. The unique
 * constraint `(manager_user_id, property_id, fiscal_year, category_code)` makes
 * this a natural upsert — editing a budget re-posts the same key.
 */
export async function upsertManagerBudget(
  db: SupabaseClient,
  input: UpsertManagerBudgetInput,
): Promise<ManagerBudget> {
  const fiscalYear = Math.round(Number(input.fiscalYear));
  if (!Number.isFinite(fiscalYear) || fiscalYear < 2000 || fiscalYear > 3000) {
    throw new Error("A valid fiscal year is required.");
  }
  const categoryCode = input.categoryCode.trim();
  if (!categoryCode) throw new Error("A category is required.");

  const monthly = normalizeMonthlyAmounts({
    monthlyAmountsCents: input.monthlyAmountsCents ?? null,
    annualCents: input.annualCents ?? null,
  });

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("manager_budgets")
    .upsert(
      {
        manager_user_id: input.managerUserId,
        property_id: input.propertyId ?? null,
        fiscal_year: fiscalYear,
        category_code: categoryCode,
        monthly_amounts_cents: monthly,
        updated_at: now,
      },
      { onConflict: "manager_user_id,property_id,fiscal_year,category_code" },
    )
    .select(MANAGER_BUDGET_SELECT)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Budget save failed.");
  return mapManagerBudgetRow(data as Record<string, unknown>);
}

export async function listManagerBudgets(
  db: SupabaseClient,
  managerUserId: string,
  filters?: { fiscalYear?: number; propertyId?: string },
): Promise<ManagerBudget[]> {
  let query = db
    .from("manager_budgets")
    .select(MANAGER_BUDGET_SELECT)
    .eq("manager_user_id", managerUserId)
    .order("fiscal_year", { ascending: false })
    .order("category_code", { ascending: true })
    .limit(500);
  if (filters?.fiscalYear) query = query.eq("fiscal_year", Math.round(filters.fiscalYear));
  if (filters?.propertyId) query = query.eq("property_id", filters.propertyId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapManagerBudgetRow(row as Record<string, unknown>));
}
