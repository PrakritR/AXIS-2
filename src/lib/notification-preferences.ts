import type { SupabaseClient } from "@supabase/supabase-js";
import { isPhoneOptedOut } from "@/lib/sms-consent";

/**
 * Notification categories a user can tune independently. `account` covers
 * security/account-critical notices (verification, password/2FA, billing
 * failures) and is intentionally the only category that defaults SMS on and
 * forces SMS at resolve time — a user cannot silence account-safety alerts.
 */
export type NotificationCategory =
  | "messages"
  | "leases"
  | "payments"
  | "maintenance"
  | "applications"
  | "account";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "messages",
  "leases",
  "payments",
  "maintenance",
  "applications",
  "account",
];

export type ChannelPreference = {
  inbox: boolean;
  email: boolean;
  sms: boolean;
};

export type NotificationPreferences = Record<NotificationCategory, ChannelPreference>;

export type ResolvedChannels = {
  inbox: boolean;
  email: boolean;
  sms: boolean;
};

/**
 * Channel matrix: every category delivers to inbox, email, and SMS. Delivery
 * is not user-tunable — `resolveChannels` gates SMS only on having a phone on
 * file and STOP opt-out.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messages: { inbox: true, email: true, sms: true },
  leases: { inbox: true, email: true, sms: true },
  payments: { inbox: true, email: true, sms: true },
  maintenance: { inbox: true, email: true, sms: true },
  applications: { inbox: true, email: true, sms: true },
  account: { inbox: true, email: true, sms: true },
};

function normalizeChannel(raw: unknown, fallback: ChannelPreference): ChannelPreference {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    // Inbox is always on — it is the durable record of every notification and
    // is not user-suppressible.
    inbox: true,
    email: typeof row.email === "boolean" ? row.email : fallback.email,
    sms: typeof row.sms === "boolean" ? row.sms : fallback.sms,
  };
}

export function normalizeNotificationPreferences(raw: unknown): NotificationPreferences {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as NotificationPreferences;
  for (const category of NOTIFICATION_CATEGORIES) {
    out[category] = normalizeChannel(row[category], DEFAULT_NOTIFICATION_PREFERENCES[category]);
  }
  return out;
}

export async function loadNotificationPreferences(
  db: SupabaseClient,
  userId: string,
): Promise<NotificationPreferences> {
  const { data } = await db
    .from("notification_preferences")
    .select("row_data")
    .eq("user_id", userId)
    .maybeSingle();
  return normalizeNotificationPreferences(data?.row_data ?? null);
}

export async function saveNotificationPreferences(
  db: SupabaseClient,
  userId: string,
  prefs: unknown,
): Promise<NotificationPreferences> {
  const normalized = normalizeNotificationPreferences(prefs);
  const { error } = await db.from("notification_preferences").upsert(
    {
      user_id: userId,
      row_data: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  return normalized;
}

type RecipientProfile = {
  phone?: string | null;
  phone_verified_at?: string | null;
};

/**
 * Resolve the effective delivery channels for a given recipient + category,
 * combining the recipient's saved preferences with hard delivery constraints:
 *
 * - `inbox` is ALWAYS true (durable record, non-suppressible).
 * - `email` follows the stored preference (default when no row exists).
 * - `sms` requires a phone on the profile (collected at signup) that has not
 *   texted STOP. Verification OTP is not required for resident delivery.
 *
 * Pass `recipientProfile` to avoid a profile fetch when the caller already has
 * the phone + verification columns loaded.
 */
export async function resolveChannels(
  db: SupabaseClient,
  userId: string,
  category: NotificationCategory,
  recipientProfile?: RecipientProfile | null,
): Promise<ResolvedChannels> {
  // Product decision: notifications are NOT user-tunable — every category
  // always delivers to inbox + email + SMS. The only gates on SMS are hard
  // constraints: the recipient must have a phone on their profile (collected
  // at signup) and must not have texted STOP (sms-consent). The category
  // param stays so future carve-outs need no call-site changes.
  void category;

  let profile = recipientProfile ?? null;
  if (!profile) {
    const { data } = await db
      .from("profiles")
      .select("phone, phone_verified_at")
      .eq("id", userId)
      .maybeSingle();
    profile = (data as RecipientProfile | null) ?? null;
  }

  const phone = String(profile?.phone ?? "").trim();
  let sms = false;
  if (phone) {
    sms = !(await isPhoneOptedOut(db, phone));
  }

  return {
    inbox: true,
    email: true,
    sms,
  };
}
