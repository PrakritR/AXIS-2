import twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";
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
function resolveInboundWebhookUrl(): string {
  const explicit = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (explicit) return explicit;
  const base = (resolveEmailLinkBaseUrl() || PRODUCTION_APP_ORIGIN).replace(/\/$/, "");
  return `${base}/api/twilio/inbound`;
}

/**
 * Provision (or reuse) a per-manager Axis work number for two-way SMS.
 *
 * Idempotent: if `profiles.sms_from_number` is already set, it is returned
 * unchanged and no Twilio calls are made. Otherwise this searches for an
 * available SMS-capable US local number, purchases it with its inbound SMS
 * webhook pointed at `/api/twilio/inbound`, attaches it to the Messaging
 * Service (when `TWILIO_MESSAGING_SERVICE_SID` is configured, best-effort),
 * and persists it on the profile via the passed service-role client.
 *
 * Never throws — every failure path (no credentials, no numbers found, Twilio
 * error, DB error) resolves to `{ ok: false, error }`.
 */
export async function ensureManagerSmsNumber(
  db: SupabaseClient,
  managerUserId: string,
  opts?: { areaCode?: string },
): Promise<EnsureManagerSmsNumberResult> {
  if (!managerUserId) return { ok: false, error: "Missing manager id." };

  // 1. Idempotent short-circuit — already provisioned.
  try {
    const { data: existing, error } = await db
      .from("profiles")
      .select("sms_from_number")
      .eq("id", managerUserId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const current = String(existing?.sms_from_number ?? "").trim();
    if (current) return { ok: true, number: current };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the profile." };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "SMS is not configured (missing Twilio credentials)." };
  }

  const areaCodeDigits = opts?.areaCode?.replace(/\D/g, "").slice(0, 3);
  const areaCode = areaCodeDigits && areaCodeDigits.length === 3 ? Number(areaCodeDigits) : undefined;

  try {
    const client = twilio(accountSid, authToken);

    // 2. Find an available SMS-capable US local number.
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

    // 3. Purchase it, wiring the inbound SMS webhook to our handler.
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: candidate,
      smsUrl: resolveInboundWebhookUrl(),
      smsMethod: "POST",
    });
    const number = String(purchased.phoneNumber ?? candidate).trim();
    const phoneNumberSid = String(purchased.sid ?? "").trim();

    // 4. Attach to the Messaging Service when configured (best-effort — the
    // number already works for send/receive without it).
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
    if (messagingServiceSid && phoneNumberSid) {
      try {
        await client.messaging.v1.services(messagingServiceSid).phoneNumbers.create({ phoneNumberSid });
      } catch {
        /* non-fatal: retriable from the Twilio console */
      }
    }

    // 5. Atomically claim the slot (service-role): only persist if still unset,
    //    so a concurrent provision (double-click) can't leave two purchased
    //    numbers. If the claim writes zero rows — a DB error OR a concurrent
    //    winner already stored a number — release the number we just bought so
    //    it isn't orphaned and billed, then reconcile.
    const { data: claimed, error } = await db
      .from("profiles")
      .update({ sms_from_number: number })
      .eq("id", managerUserId)
      .is("sms_from_number", null)
      .select("sms_from_number");
    if (error || !claimed || claimed.length === 0) {
      if (phoneNumberSid) {
        await client
          .incomingPhoneNumbers(phoneNumberSid)
          .remove()
          .then(() => undefined, () => undefined);
      }
      if (error) return { ok: false, error: error.message };
      // Concurrent winner — return whatever number is now stored.
      const { data: winner } = await db
        .from("profiles")
        .select("sms_from_number")
        .eq("id", managerUserId)
        .maybeSingle();
      const won = String(winner?.sms_from_number ?? "").trim();
      return won
        ? { ok: true, number: won }
        : { ok: false, error: "Could not persist the work number." };
    }

    return { ok: true, number };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not provision a work number." };
  }
}
