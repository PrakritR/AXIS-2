import type { SupabaseClient } from "@supabase/supabase-js";

import { isGoogleCalendarOAuthConfigured } from "@/lib/google-calendar/settings";

import { gmailPaymentsStorageKey, type GmailPaymentTrackRole } from "./portal-role";

export type GmailPaymentsConnection = {
  connected: boolean;
  email: string | null;
  refreshToken: string | null;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  lastSyncAt: string | null;
  lastSyncMarkedPaid: number | null;
};

export const DEFAULT_GMAIL_PAYMENTS_CONNECTION: GmailPaymentsConnection = {
  connected: false,
  email: null,
  refreshToken: null,
  accessToken: null,
  accessTokenExpiresAt: null,
  lastSyncAt: null,
  lastSyncMarkedPaid: null,
};

export function normalizeGmailPaymentsConnection(raw: unknown): GmailPaymentsConnection {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const connected = r.connected === true && typeof r.refreshToken === "string" && r.refreshToken.trim().length > 0;
  return {
    connected,
    email: typeof r.email === "string" && r.email.trim() ? r.email.trim() : null,
    refreshToken: connected ? String(r.refreshToken) : null,
    accessToken: typeof r.accessToken === "string" ? r.accessToken : null,
    accessTokenExpiresAt: typeof r.accessTokenExpiresAt === "string" ? r.accessTokenExpiresAt : null,
    lastSyncAt: typeof r.lastSyncAt === "string" ? r.lastSyncAt : null,
    lastSyncMarkedPaid: typeof r.lastSyncMarkedPaid === "number" ? r.lastSyncMarkedPaid : null,
  };
}

export function gmailPaymentsPublicStatus(connection: GmailPaymentsConnection) {
  return {
    connected: connection.connected,
    email: connection.email,
    configured: isGoogleCalendarOAuthConfigured(),
    lastSyncAt: connection.lastSyncAt,
    lastSyncMarkedPaid: connection.lastSyncMarkedPaid,
  };
}

function rowDataRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
}

function readConnectionFromRowData(
  rowData: Record<string, unknown>,
  role: GmailPaymentTrackRole,
): GmailPaymentsConnection {
  const key = gmailPaymentsStorageKey(role);
  const nested = rowData[key];
  if (nested) return normalizeGmailPaymentsConnection(nested);
  // Legacy flat gmailPayments = manager connection
  if (role === "manager" && rowData.gmailPayments) {
    return normalizeGmailPaymentsConnection(rowData.gmailPayments);
  }
  return { ...DEFAULT_GMAIL_PAYMENTS_CONNECTION };
}

export async function loadGmailPaymentsConnection(
  db: SupabaseClient,
  userId: string,
  role: GmailPaymentTrackRole,
): Promise<GmailPaymentsConnection> {
  const { data, error } = await db
    .from("manager_automation_settings")
    .select("row_data")
    .eq("manager_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return readConnectionFromRowData(rowDataRecord(data?.row_data), role);
}

export async function saveGmailPaymentsConnection(
  db: SupabaseClient,
  userId: string,
  role: GmailPaymentTrackRole,
  patch: Partial<GmailPaymentsConnection>,
): Promise<GmailPaymentsConnection> {
  const current = await loadGmailPaymentsConnection(db, userId, role);
  const next = normalizeGmailPaymentsConnection({ ...current, ...patch });
  const { data: existing, error: readError } = await db
    .from("manager_automation_settings")
    .select("row_data")
    .eq("manager_user_id", userId)
    .maybeSingle();
  if (readError) throw readError;

  const row_data = rowDataRecord(existing?.row_data);
  row_data[gmailPaymentsStorageKey(role)] = next;
  if (role === "manager") {
    row_data.gmailPayments = next;
  }

  const { error } = await db.from("manager_automation_settings").upsert(
    {
      manager_user_id: userId,
      row_data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "manager_user_id" },
  );
  if (error) throw error;
  return next;
}

export async function clearGmailPaymentsConnection(
  db: SupabaseClient,
  userId: string,
  role: GmailPaymentTrackRole,
): Promise<void> {
  await saveGmailPaymentsConnection(db, userId, role, {
    ...DEFAULT_GMAIL_PAYMENTS_CONNECTION,
    connected: false,
  });
}
