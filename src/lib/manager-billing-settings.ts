import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentApplicationOrder = "rent_first" | "fees_first";

export type ManagerBillingSettings = {
  paymentApplicationOrder: PaymentApplicationOrder;
  nsfFeeEnabled: boolean;
  nsfFeeAmountCents: number;
  defaultLateFeeWaiverReasons: string[];
};

export const DEFAULT_MANAGER_BILLING_SETTINGS: ManagerBillingSettings = {
  paymentApplicationOrder: "rent_first",
  nsfFeeEnabled: true,
  nsfFeeAmountCents: 3500,
  defaultLateFeeWaiverReasons: ["First-time courtesy", "Bank error documented", "Lease dispute pending"],
};

export async function loadManagerBillingSettings(
  db: SupabaseClient,
  managerUserId: string,
): Promise<ManagerBillingSettings> {
  const { data, error } = await db
    .from("manager_billing_settings")
    .select("row_data")
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = (data?.row_data ?? {}) as Partial<ManagerBillingSettings>;
  return {
    ...DEFAULT_MANAGER_BILLING_SETTINGS,
    ...raw,
    nsfFeeAmountCents: Math.max(0, Math.round(Number(raw.nsfFeeAmountCents ?? DEFAULT_MANAGER_BILLING_SETTINGS.nsfFeeAmountCents))),
  };
}

export async function saveManagerBillingSettings(
  db: SupabaseClient,
  managerUserId: string,
  settings: ManagerBillingSettings,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db.from("manager_billing_settings").upsert(
    {
      manager_user_id: managerUserId,
      row_data: settings,
      updated_at: now,
    },
    { onConflict: "manager_user_id" },
  );
  if (error) throw new Error(error.message);
}
