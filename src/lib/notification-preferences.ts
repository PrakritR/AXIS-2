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
 * Default channel matrix. Every category delivers to the in-app inbox and email;
 * SMS is opt-in per category and defaults off — except `account`, whose SMS
 * cannot be disabled (see `resolveChannels`).
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messages: { inbox: true, email: true, sms: false },
  leases: { inbox: true, email: true, sms: false },
  payments: { inbox: true, email: true, sms: false },
  maintenance: { inbox: true, email: true, sms: false },
  applications: { inbox: true, email: true, sms: false },
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
 * - `sms` requires the preference on (OR `account`, which force-enables it) AND
 *   the recipient having a verified phone AND that phone not being opted out of
 *   SMS (STOP handling in sms-consent). Any missing condition disables SMS.
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
  const prefs = await loadNotificationPreferences(db, userId);
  const channel = prefs[category] ?? DEFAULT_NOTIFICATION_PREFERENCES[category];

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
  const phoneVerified = Boolean(profile?.phone_verified_at);
  // `account` cannot silence SMS; everything else honors the stored preference.
  const smsWanted = category === "account" ? true : channel.sms;

  let sms = false;
  if (smsWanted && phone && phoneVerified) {
    sms = !(await isPhoneOptedOut(db, phone));
  }

  return {
    inbox: true,
    email: channel.email,
    sms,
  };
}
