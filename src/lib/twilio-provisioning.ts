import twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clawLeasingAgentPhoneE164,
  isClawSharedLineBridgeEnabled,
  isLegacyClawSharedSmsNumber,
  isPlaceholderManagerWorkNumber,
} from "@/lib/claw-leasing-links";
import { PRODUCTION_APP_ORIGIN, resolveEmailLinkBaseUrl } from "@/lib/app-url";

export type EnsureManagerSmsNumberResult =
  | { ok: true; number: string }
  | { ok: false; error: string };

/**
 * Fully-qualified URL Twilio should POST inbound SMS to. `TWILIO_WEBHOOK_URL`
 * (when set) is the exact endpoint the inbound route validates signatures
 * against, so the purchased number's smsUrl MUST match it verbatim. Otherwise
 * we build it off the canonical (never-vercel) app origin.
 */
export function resolveInboundWebhookUrl(): string {
  const explicit = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (explicit) return explicit;
  const base = (resolveEmailLinkBaseUrl() || PRODUCTION_APP_ORIGIN).replace(/\/$/, "");
  return `${base}/api/twilio/inbound`;
}

export type PurchaseTwilioNumberResult =
  | { ok: true; number: string; sid: string; messagingServiceSid: string | null }
  | { ok: false; error: string };

/**
 * Provider-only Twilio purchase: find an SMS-capable US local number, buy it,
 * wire the inbound webhook, and best-effort attach it to the Messaging Service
 * (so it inherits the A2P campaign). Does NO database writes — the state-machine
 * caller owns persistence, the atomic slot claim, and rollback-on-race.
 */
export async function purchaseManagerTwilioNumber(opts?: {
  areaCode?: string;
}): Promise<PurchaseTwilioNumberResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "SMS is not configured (missing Twilio credentials)." };
  }

  const areaCodeDigits = opts?.areaCode?.replace(/\D/g, "").slice(0, 3);
  const areaCode = areaCodeDigits && areaCodeDigits.length === 3 ? Number(areaCodeDigits) : undefined;

  try {
    const client = twilio(accountSid, authToken);

    const available = await client.availablePhoneNumbers("US").local.list({
      ...(areaCode ? { areaCode } : {}),
      smsEnabled: true,
      limit: 1,
    });
    const candidate = String(available[0]?.phoneNumber ?? "").trim();
    if (!candidate) {
      return {
        ok: false,
        error: areaCode
          ? `No SMS-capable numbers are available in area code ${areaCodeDigits} right now.`
          : "No SMS-capable numbers are available right now — try again shortly.",
      };
    }

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: candidate,
      smsUrl: resolveInboundWebhookUrl(),
      smsMethod: "POST",
    });
    const number = String(purchased.phoneNumber ?? candidate).trim();
    const phoneNumberSid = String(purchased.sid ?? "").trim();

    let messagingServiceSid: string | null = null;
    const svc = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
    if (svc && phoneNumberSid) {
      try {
        await client.messaging.v1.services(svc).phoneNumbers.create({ phoneNumberSid });
        messagingServiceSid = svc;
      } catch {
        /* non-fatal: retriable from the Twilio console */
      }
    }

    return { ok: true, number, sid: phoneNumberSid, messagingServiceSid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not provision a work number." };
  }
}

/** Release a purchased Twilio number (rollback-on-race / deliberate release). */
export async function releaseTwilioNumber(sid: string | null | undefined): Promise<void> {
  const s = String(sid ?? "").trim();
  if (!s) return;
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return;
  try {
    await twilio(accountSid, authToken).incomingPhoneNumbers(s).remove();
  } catch {
    /* ignore — best effort */
  }
}

/**
 * Back-compat wrapper. The per-manager number lifecycle now lives in the
 * `manager_sms_numbers` state machine (`provisionManagerNumber`), which is
 * money-guarded (`SMS_PROVISIONING_ENABLED`) and records provider ids + state.
 * Existing callers keep the same `{ ok, number }` contract.
 *
 * Idempotent: a real stored number is returned unchanged; the legacy Claw shared
 * line is kept while the bridge is on so Twilio stays dormant during A2P review.
 */
export async function ensureManagerSmsNumber(
  db: SupabaseClient,
  managerUserId: string,
  opts?: { areaCode?: string },
): Promise<EnsureManagerSmsNumberResult> {
  if (!managerUserId) return { ok: false, error: "Missing manager id." };

  try {
    const { data: existing } = await db
      .from("profiles")
      .select("sms_from_number")
      .eq("id", managerUserId)
      .maybeSingle();
    const current = String(existing?.sms_from_number ?? "").trim();
    if (current) {
      if (isLegacyClawSharedSmsNumber(current) && isClawSharedLineBridgeEnabled()) {
        return { ok: true, number: current };
      }
      if (!isPlaceholderManagerWorkNumber(current)) {
        return { ok: true, number: current };
      }
      // Clear the placeholder stamp so the state machine can claim the slot.
      await db
        .from("profiles")
        .update({ sms_from_number: null })
        .eq("id", managerUserId)
        .eq("sms_from_number", current)
        .then(() => undefined, () => undefined);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the profile." };
  }

  const { provisionManagerNumber } = await import("@/lib/sms/manager-number-provisioning.server");
  const res = await provisionManagerNumber(db, managerUserId, opts);
  return res.ok ? { ok: true, number: res.number } : { ok: false, error: res.error };
}

/**
 * Read the manager's work number for SMS UI / display. Keeps the Claw shared
 * line while the bridge is on; otherwise returns the stored number (even when
 * registration is still pending — the manager should see their own number).
 * SEND-gating (registration approved) is applied separately by
 * `resolveActiveManagerSendNumber`.
 */
export async function resolveManagerWorkNumber(
  db: SupabaseClient,
  managerUserId: string,
): Promise<string | null> {
  if (!managerUserId) return null;
  if (isClawSharedLineBridgeEnabled()) {
    return clawLeasingAgentPhoneE164();
  }
  const { data } = await db.from("profiles").select("sms_from_number").eq("id", managerUserId).maybeSingle();
  const current = String(data?.sms_from_number ?? "").trim();
  if (current && isLegacyClawSharedSmsNumber(current) && isClawSharedLineBridgeEnabled()) {
    return current;
  }
  if (current && !isPlaceholderManagerWorkNumber(current)) return current;
  const provisioned = await ensureManagerSmsNumber(db, managerUserId);
  return provisioned.ok ? provisioned.number : null;
}
