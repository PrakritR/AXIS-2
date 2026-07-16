/**
 * PropLane SMS transport — Twilio is the production source of truth.
 *
 * Claw Messenger is opt-in legacy only (`CLAW_MESSENGER_ENABLED=1` + API key).
 * Prefer `sendFromManagerWorkNumber` / `sendPropLaneSms` for all leasing,
 * resident, and manager-brief texts.
 */

import { after } from "next/server";
import {
  isClawMessengerConfigured,
  normalizeE164Us,
  registerClawMessengerRoute,
  sendClawMessengerText,
} from "@/lib/claw-messenger.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { normalizeE164, sendSms } from "@/lib/twilio";

export type PropLaneSmsResult = {
  ok: boolean;
  channel?: "twilio" | "claw";
  sid?: string;
  error?: string;
};

function normalizeTo(raw: string): string | null {
  return normalizeE164Us(raw) ?? normalizeE164(raw);
}

/** True when the opt-in Claw relay may be used (never the production default). */
export function isClawTransportEnabled(): boolean {
  return isClawMessengerConfigured();
}

/**
 * Send an SMS. Twilio wins whenever `fromNumber` is a real work number.
 * Claw is only attempted when explicitly enabled and Twilio cannot send.
 */
export async function sendPropLaneSms(args: {
  to: string;
  text: string;
  fromNumber?: string | null;
}): Promise<PropLaneSmsResult> {
  const text = args.text.trim();
  if (!text) return { ok: false, error: "empty_body" };
  const to = normalizeTo(args.to);
  if (!to) return { ok: false, error: "invalid_to" };

  const from = args.fromNumber?.trim() || null;
  if (from) {
    const twilio = await sendSms(to, text, from);
    if (twilio.sent) {
      return { ok: true, channel: "twilio", sid: twilio.sid };
    }
    // Fall through to Claw only when explicitly enabled (dual-rail / trial).
    if (!isClawTransportEnabled()) {
      return { ok: false, channel: "twilio", error: twilio.error || "twilio_send_failed" };
    }
  }

  if (!isClawTransportEnabled()) {
    return { ok: false, error: from ? "twilio_send_failed" : "missing_from" };
  }

  await registerClawMessengerRoute(to);
  const claw = await sendClawMessengerText({ to, text });
  return {
    ok: claw.ok,
    channel: claw.ok ? "claw" : undefined,
    sid: claw.messageId,
    error: claw.ok ? undefined : claw.error,
  };
}

/** Look up the manager's Twilio work number and send from it. */
export async function sendFromManagerWorkNumber(args: {
  managerUserId: string;
  to: string;
  text: string;
  /** When already known (inbound webhook), skip the profile lookup. */
  fromNumber?: string | null;
}): Promise<PropLaneSmsResult> {
  const managerUserId = args.managerUserId.trim();
  if (!managerUserId) return { ok: false, error: "missing_manager" };

  let from = args.fromNumber?.trim() || null;
  if (!from) {
    try {
      const db = createSupabaseServiceRoleClient();
      const { data } = await db
        .from("profiles")
        .select("sms_from_number")
        .eq("id", managerUserId)
        .maybeSingle();
      from = String(data?.sms_from_number ?? "").trim() || null;
    } catch {
      from = null;
    }
  }

  return sendPropLaneSms({ to: args.to, text: args.text, fromNumber: from });
}

/**
 * Fire-and-forget: buy/assign a Twilio work number after manager signup.
 * Uses Next.js `after()` when available so the request isn't blocked.
 */
export function scheduleManagerMessagingReady(managerUserId: string): void {
  const uid = managerUserId.trim();
  if (!uid) return;

  const run = async () => {
    try {
      const { ensureManagerSmsNumber } = await import("@/lib/twilio-provisioning");
      const db = createSupabaseServiceRoleClient();
      await ensureManagerSmsNumber(db, uid);
    } catch (e) {
      console.error("scheduleManagerMessagingReady failed", uid, e);
    }
  };

  try {
    after(() => void run());
  } catch {
    void run();
  }
}
