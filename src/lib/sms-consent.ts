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
 * Common stored formats for one US number, so phone columns stored
 * un-normalized (`(555) 123-4567`, `5551234567`, `+15551234567`) can be
 * matched against any input format. The single shared variant set — the
 * inbound webhooks and the consent read both use it so they cannot drift.
 */
export function profilePhoneVariants(phone: string): string[] {
  const raw = String(phone ?? "").trim();
  const key = normalizeConsentPhone(raw);
  if (key.length !== 10) return [...new Set([raw, key])].filter(Boolean);
  return [
    ...new Set([
      `+1${key}`,
      key,
      `1${key}`,
      `(${key.slice(0, 3)}) ${key.slice(3, 6)}-${key.slice(6)}`,
      `${key.slice(0, 3)}-${key.slice(3, 6)}-${key.slice(6)}`,
      raw,
    ]),
  ].filter(Boolean);
}

/** Opted out iff opted_out_at is set and no opt-in is at least as recent. */
export function optedOutFromTimestamps(
  optedInRaw: unknown,
  optedOutRaw: unknown,
): boolean {
  const optedOutAt = optedOutRaw ? Date.parse(String(optedOutRaw)) : null;
  if (optedOutAt == null || Number.isNaN(optedOutAt)) return false;
  const optedInAt = optedInRaw ? Date.parse(String(optedInRaw)) : null;
  if (optedInAt != null && !Number.isNaN(optedInAt) && optedInAt >= optedOutAt) return false;
  return true;
}

/**
 * True when the number is opted out — the single unified read path. STOP and
 * START are recorded in two places by different webhooks:
 *   1. `sms_consent` ledger (phone-keyed) — the manager work-line webhook.
 *   2. `profiles.sms_opt_out_at` / `sms_consent_at` (user-keyed) — the
 *      vendor-agent webhook and in-portal consent.
 * Every send funnels through this choke point. Supersede is computed GLOBALLY
 * across both stores: the latest opt-in anywhere beats an older opt-out
 * anywhere, so a STOP on one line followed by a START on the other re-enables
 * the number instead of dead-ending. A number we've never seen is NOT opted
 * out; a profiles-side error falls back to the ledger alone.
 */
export async function isPhoneOptedOut(db: SupabaseClient, phone: string): Promise<boolean> {
  const key = normalizeConsentPhone(phone);
  if (!key) return false;

  const parseTs = (raw: unknown): number | null => {
    const t = raw ? Date.parse(String(raw)) : NaN;
    return Number.isNaN(t) ? null : t;
  };
  const optIns: number[] = [];
  const optOuts: number[] = [];
  const push = (arr: number[], raw: unknown) => {
    const t = parseTs(raw);
    if (t != null) arr.push(t);
  };

  // 1) Canonical phone-keyed ledger.
  const { data: ledger } = await db
    .from("sms_consent")
    .select("opted_in_at, opted_out_at")
    .eq("phone", key)
    .maybeSingle();
  push(optIns, ledger?.opted_in_at);
  push(optOuts, ledger?.opted_out_at);

  // 2) Bridge the vendor store: any profile whose phone matches this number
  // contributes its opt-out/consent timestamps to the global comparison.
  try {
    const { data: profiles } = await db
      .from("profiles")
      .select("sms_opt_out_at, sms_consent_at")
      .in("phone", profilePhoneVariants(phone));
    for (const p of profiles ?? []) {
      push(optIns, p.sms_consent_at);
      push(optOuts, p.sms_opt_out_at);
    }
  } catch {
    // Fail open on the secondary store — the ledger alone still governs.
    return optedOutFromTimestamps(ledger?.opted_in_at, ledger?.opted_out_at);
  }

  if (optOuts.length === 0) return false;
  const latestOut = Math.max(...optOuts);
  const latestIn = optIns.length > 0 ? Math.max(...optIns) : null;
  return latestIn == null || latestIn < latestOut;
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
