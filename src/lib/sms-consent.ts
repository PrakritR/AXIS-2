import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SMS consent (opt-in/opt-out) ledger. Stored keyed by a normalized digit
 * string so the same US number matches regardless of how a webhook or profile
 * formats it (`+15551234567`, `15551234567`, `(555) 123-4567`, …).
 *
 * All reads/writes use a service-role client — the sms_consent table is
 * service-role-only (RLS enabled, no policies).
 */

/**
 * Canonicalize a US phone to a bare 10-digit string so the same number matches
 * regardless of source formatting. Twilio delivers `From` in E.164
 * (`+15551234567` → 11 digits), while `profiles.phone` is stored un-normalized
 * for residents/vendors (`(555) 123-4567`, `5551234567`). Both must reduce to
 * the SAME key or an opted-out number is silently texted (fail-open). Strips the
 * leading US country code so `+15551234567`, `15551234567`, and `5551234567` all
 * become `5551234567`.
 */
export function normalizeConsentPhone(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/**
 * True when the number's latest consent state is opted-out: an sms_consent row
 * exists with opted_out_at set and no opt-in that is at least as recent. A
 * number we've never seen is treated as NOT opted out.
 */
export async function isPhoneOptedOut(db: SupabaseClient, phone: string): Promise<boolean> {
  const key = normalizeConsentPhone(phone);
  if (!key) return false;
  const { data } = await db
    .from("sms_consent")
    .select("opted_in_at, opted_out_at")
    .eq("phone", key)
    .maybeSingle();
  if (!data) return false;
  const optedOutAt = data.opted_out_at ? Date.parse(String(data.opted_out_at)) : null;
  if (optedOutAt == null || Number.isNaN(optedOutAt)) return false;
  const optedInAt = data.opted_in_at ? Date.parse(String(data.opted_in_at)) : null;
  // Opted out unless a later (or simultaneous) opt-in supersedes it.
  if (optedInAt != null && !Number.isNaN(optedInAt) && optedInAt >= optedOutAt) return false;
  return true;
}

/** Record that a number opted OUT (STOP/UNSUBSCRIBE/…). Idempotent upsert. */
export async function recordOptOut(
  db: SupabaseClient,
  phone: string,
  userId?: string | null,
): Promise<void> {
  const key = normalizeConsentPhone(phone);
  if (!key) return;
  const now = new Date().toISOString();
  await db
    .from("sms_consent")
    .upsert(
      {
        phone: key,
        ...(userId ? { user_id: userId } : {}),
        opted_out_at: now,
        updated_at: now,
      },
      { onConflict: "phone" },
    )
    .then(() => undefined, () => undefined);
}

/** Record that a number opted IN (START/YES/UNSTOP or explicit consent). */
export async function recordOptIn(
  db: SupabaseClient,
  phone: string,
  userId?: string | null,
  source?: string | null,
): Promise<void> {
  const key = normalizeConsentPhone(phone);
  if (!key) return;
  const now = new Date().toISOString();
  await db
    .from("sms_consent")
    .upsert(
      {
        phone: key,
        ...(userId ? { user_id: userId } : {}),
        opted_in_at: now,
        ...(source ? { consent_source: source } : {}),
        updated_at: now,
      },
      { onConflict: "phone" },
    )
    .then(() => undefined, () => undefined);
}
