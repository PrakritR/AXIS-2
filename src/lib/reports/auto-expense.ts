import type { SupabaseClient } from "@supabase/supabase-js";
import { isCategoryDeductible } from "@/lib/reports/categories";

export type AutoExpenseInput = {
  categoryCode: string;
  amountCents: number;
  expenseDate: string;
  memo: string;
  propertyId?: string | null;
  vendorId?: string | null;
  /** Stripe PaymentIntent or invoice id this expense was generated from. */
  sourceStripePaymentId: string;
};

/**
 * Records a system-generated expense tied to a Stripe payment (Checkr
 * screening charge, subscription invoice). Idempotent on
 * (manager_user_id, source_stripe_payment_id) via a partial unique index, so
 * webhook retries or duplicate calls upsert onto the existing row instead of
 * creating a second expense.
 */
export async function recordAutoExpense(
  db: SupabaseClient,
  managerUserId: string,
  input: AutoExpenseInput,
): Promise<void> {
  const { error } = await db.from("manager_expense_entries").upsert(
    {
      manager_user_id: managerUserId,
      property_id: input.propertyId?.trim() || null,
      category_code: input.categoryCode,
      amount_cents: input.amountCents,
      expense_date: input.expenseDate,
      memo: input.memo,
      vendor_id: input.vendorId?.trim() || null,
      tax_deductible: isCategoryDeductible(input.categoryCode),
      source_stripe_payment_id: input.sourceStripePaymentId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "manager_user_id,source_stripe_payment_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}
