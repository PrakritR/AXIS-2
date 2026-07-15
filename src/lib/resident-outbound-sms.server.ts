/**
 * Resident outbound SMS/iMessage — prefer Claw Messenger (shared agent line),
 * fall back to Twilio from the manager work number.
 *
 * Use this for account welcome, lease signing, payment reminders, and other
 * resident lifecycle texts so they leave from the same number residents text
 * for tours/apply.
 */

import {
  isClawMessengerConfigured,
  normalizeE164Us,
  registerClawMessengerRoute,
  sendClawMessengerText,
} from "@/lib/claw-messenger.server";
import { isLinqEnabledForManager, sendLinqText } from "@/lib/linq.server";
import { isPhoneOptedOut } from "@/lib/sms-consent";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { normalizeE164, sendSms } from "@/lib/twilio";

export type ResidentOutboundSmsResult = {
  sent: boolean;
  channel?: "linq" | "claw" | "twilio";
  error?: string;
  sid?: string;
};

function trimSmsBody(text: string, max = 480): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Send a text to a resident phone.
 *
 * - When `CLAW_MESSENGER_API_KEY` is set: send via Claw (iMessage/RCS/SMS) and
 *   register the contact so replies reach the leasing bot / gateway.
 * - Else: Twilio `sendSms` using `fromNumber` (manager `sms_from_number`).
 *
 * Honors STOP opt-out unless `skipOptOutCheck`.
 */
export async function sendResidentOutboundSms(args: {
  to: string;
  text: string;
  /** Twilio fallback From; ignored when Claw is configured. */
  fromNumber?: string | null;
  /** Manager the text is on behalf of — gates the Linq channel allowlist. */
  managerEmail?: string | null;
  skipOptOutCheck?: boolean;
}): Promise<ResidentOutboundSmsResult> {
  const text = trimSmsBody(args.text);
  if (!text) return { sent: false, error: "empty_body" };

  const toNorm = normalizeE164Us(args.to) ?? normalizeE164(args.to);
  if (!toNorm) return { sent: false, error: "invalid_to" };

  if (!args.skipOptOutCheck) {
    try {
      const db = createSupabaseServiceRoleClient();
      if (await isPhoneOptedOut(db, toNorm)) {
        return { sent: false, error: "recipient_opted_out" };
      }
    } catch {
      /* fail open — same as sendSms */
    }
  }

  // Linq (iMessage/SMS line) is the preferred channel for allowlisted managers:
  // residents see ONE number for everything and replies come back through the
  // Linq webhook into the manager's inbox.
  if (isLinqEnabledForManager(args.managerEmail)) {
    const linq = await sendLinqText(toNorm, text);
    if (linq.sent) {
      return { sent: true, channel: "linq", sid: linq.chatId };
    }
    // Fall through to Claw/Twilio on failure.
  }

  if (isClawMessengerConfigured()) {
    await registerClawMessengerRoute(toNorm);
    const result = await sendClawMessengerText({ to: toNorm, text });
    if (result.ok) {
      return { sent: true, channel: "claw", sid: result.messageId };
    }
    // Fall through to Twilio if Claw fails and a from number exists.
    if (!args.fromNumber?.trim()) {
      return { sent: false, channel: "claw", error: result.error || "claw_send_failed" };
    }
  }

  const from = args.fromNumber?.trim();
  if (!from) return { sent: false, error: "missing_from" };

  const twilio = await sendSms(toNorm, text, from, { skipOptOutCheck: args.skipOptOutCheck });
  return {
    sent: twilio.sent,
    channel: twilio.sent ? "twilio" : undefined,
    error: twilio.error,
    sid: twilio.sid,
  };
}

/** True when outbound has a transport (Linq / Claw need no Twilio number). */
export function canSendResidentOutboundSms(fromNumber?: string | null, managerEmail?: string | null): boolean {
  if (isLinqEnabledForManager(managerEmail)) return true;
  if (isClawMessengerConfigured()) return true;
  return Boolean(fromNumber?.trim());
}
