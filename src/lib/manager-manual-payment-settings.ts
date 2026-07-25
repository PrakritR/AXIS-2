import type { SupabaseClient } from "@supabase/supabase-js";

import { sanitizePaymentContactInput } from "@/lib/listing-form-inputs";

export type ManagerManualPaymentSettings = {
  zellePaymentsEnabled: boolean;
  zelleContact: string;
  venmoPaymentsEnabled: boolean;
  venmoContact: string;
};

export const DEFAULT_MANAGER_MANUAL_PAYMENT_SETTINGS: ManagerManualPaymentSettings = {
  zellePaymentsEnabled: false,
  zelleContact: "",
  venmoPaymentsEnabled: false,
  venmoContact: "",
};

export const MANAGER_MANUAL_PAYMENT_SETTINGS_EVENT = "axis:manager-manual-payment-settings";

export function normalizeManagerManualPaymentSettings(raw: unknown): ManagerManualPaymentSettings {
  const row = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const zelleContact = sanitizePaymentContactInput(String(row.zelleContact ?? "")).trim();
  const venmoContact = sanitizePaymentContactInput(String(row.venmoContact ?? "")).trim();
  const zellePaymentsEnabled = row.zellePaymentsEnabled === true && zelleContact.length > 0;
  const venmoPaymentsEnabled = row.venmoPaymentsEnabled === true && venmoContact.length > 0;
  return {
    zellePaymentsEnabled,
    zelleContact: zellePaymentsEnabled ? zelleContact : "",
    venmoPaymentsEnabled,
    venmoContact: venmoPaymentsEnabled ? venmoContact : "",
  };
}

/** Browser-safe projection — same shape; contacts only when enabled. */
export function managerManualPaymentSettingsPublic(
  settings: ManagerManualPaymentSettings,
): ManagerManualPaymentSettings {
  return normalizeManagerManualPaymentSettings(settings);
}

type StorageMode = "column" | "row_data";

let cachedStorageMode: StorageMode | null = null;

function isMissingManualPaymentsColumnMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("manual_payments") && normalized.includes("does not exist");
}

async function resolveStorageMode(db: SupabaseClient): Promise<StorageMode> {
  if (cachedStorageMode) return cachedStorageMode;
  const { error } = await db.from("manager_automation_settings").select("manual_payments").limit(1);
  if (!error) {
    cachedStorageMode = "column";
    return cachedStorageMode;
  }
  if (isMissingManualPaymentsColumnMessage(error.message)) {
    cachedStorageMode = "row_data";
    return cachedStorageMode;
  }
  throw error;
}

export async function loadManagerManualPaymentSettings(
  db: SupabaseClient,
  managerUserId: string,
): Promise<ManagerManualPaymentSettings> {
  const mode = await resolveStorageMode(db);
  const { data, error } = await db
    .from("manager_automation_settings")
    .select(mode === "column" ? "manual_payments, row_data" : "row_data")
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  if (error) throw error;
  const raw =
    mode === "column"
      ? data?.manual_payments
      : (data?.row_data as Record<string, unknown> | null)?.manualPayments;
  return normalizeManagerManualPaymentSettings(raw);
}

export async function saveManagerManualPaymentSettings(
  db: SupabaseClient,
  managerUserId: string,
  settings: ManagerManualPaymentSettings,
): Promise<ManagerManualPaymentSettings> {
  const normalized = normalizeManagerManualPaymentSettings(settings);
  const mode = await resolveStorageMode(db);

  if (mode === "column") {
    const { error } = await db.from("manager_automation_settings").upsert(
      {
        manager_user_id: managerUserId,
        manual_payments: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "manager_user_id" },
    );
    if (error) throw error;
    return normalized;
  }

  const { data: existing } = await db
    .from("manager_automation_settings")
    .select("row_data")
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  const rowData =
    existing?.row_data && typeof existing.row_data === "object" && !Array.isArray(existing.row_data)
      ? { ...(existing.row_data as Record<string, unknown>) }
      : {};
  rowData.manualPayments = normalized;
  const { error } = await db.from("manager_automation_settings").upsert(
    {
      manager_user_id: managerUserId,
      row_data: rowData,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "manager_user_id" },
  );
  if (error) throw error;
  return normalized;
}
