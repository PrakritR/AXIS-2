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
import {
  ensureSmsIncludesPortalLink,
  smsLinkKindForThreadTopic,
  type ResidentSmsLinkKind,
} from "@/lib/claw-resident-links";
import {
  mirrorAutomatedResidentSmsToManager,
  openClawResidentThread,
  type ClawThreadTopic,
} from "@/lib/claw-resident-messaging.server";
import { isPhoneOptedOut } from "@/lib/sms-consent";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { normalizeE164, sendSms } from "@/lib/twilio";

export type ResidentOutboundSmsResult = {
  sent: boolean;
  channel?: "claw" | "twilio";
  error?: string;
  sid?: string;
};

export type ResidentOutboundThreadOpts = {
  managerUserId: string;
  residentUserId?: string | null;
  residentEmail?: string | null;
  topic: ClawThreadTopic;
};

function trimSmsBody(text: string, max = 480): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function maybeOpenThread(toNorm: string, thread?: ResidentOutboundThreadOpts | null): Promise<void> {
  if (!thread?.managerUserId) return;
  try {
    await openClawResidentThread({
      managerUserId: thread.managerUserId,
      residentPhone: toNorm,
      residentUserId: thread.residentUserId,
      residentEmail: thread.residentEmail,
      topic: thread.topic,
    });
  } catch {
    /* non-critical — SMS already sent */
  }
}

/** Resident gets the plain automated text; manager gets a labeled carbon copy. */
async function maybeMirrorToManager(
  toNorm: string,
  text: string,
  thread?: ResidentOutboundThreadOpts | null,
  mirrorToManager?: boolean,
): Promise<void> {
  if (mirrorToManager === false || !thread?.managerUserId) return;
  try {
    await mirrorAutomatedResidentSmsToManager({
      managerUserId: thread.managerUserId,
      residentPhone: toNorm,
      text,
      residentUserId: thread.residentUserId,
      residentEmail: thread.residentEmail,
      topic: thread.topic,
    });
  } catch {
    /* non-critical */
  }
}

/**
 * Send a text to a resident phone.
 *
 * - When `CLAW_MESSENGER_API_KEY` is set: send via Claw (iMessage/RCS/SMS) and
 *   register the contact so replies reach the leasing bot / gateway.
 * - Else: Twilio `sendSms` using `fromNumber` (manager `sms_from_number`).
 *
 * Pass `openThread` after payment/lease/move-in SMS so the manager can reply
 * from their personal phone on the same agent-line conversation.
 *
 * Honors STOP opt-out unless `skipOptOutCheck`.
 */
export async function sendResidentOutboundSms(args: {
  to: string;
  text: string;
  /** Twilio fallback From; ignored when Claw is configured. */
  fromNumber?: string | null;
  skipOptOutCheck?: boolean;
  /** Open/refresh durable manager↔resident Claw thread after a successful send. */
  openThread?: ResidentOutboundThreadOpts | null;
  /**
   * When set (or inferred from openThread.topic), appends a default portal deep
   * link if the body has no URL yet — payments, lease signing, move-in, etc.
   */
  linkKind?: ResidentSmsLinkKind | null;
  /**
   * When openThread is set, also text the manager a labeled
   * "From PropLane (sent to resident): …" copy. Default true.
   */
  mirrorToManager?: boolean;
}): Promise<ResidentOutboundSmsResult> {
  let text = trimSmsBody(args.text);
  if (!text) return { sent: false, error: "empty_body" };

  // `undefined` → infer from openThread; explicit `null` → skip (caller already linked).
  const linkKind =
    args.linkKind === undefined
      ? args.openThread?.topic
        ? smsLinkKindForThreadTopic(args.openThread.topic)
        : null
      : args.linkKind;
  if (linkKind) {
    text = trimSmsBody(ensureSmsIncludesPortalLink(text, linkKind));
  }

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

  if (isClawMessengerConfigured()) {
    await registerClawMessengerRoute(toNorm);
    const result = await sendClawMessengerText({ to: toNorm, text });
    if (result.ok) {
      await maybeOpenThread(toNorm, args.openThread);
      await maybeMirrorToManager(toNorm, text, args.openThread, args.mirrorToManager);
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
  if (twilio.sent) {
    await maybeOpenThread(toNorm, args.openThread);
    await maybeMirrorToManager(toNorm, text, args.openThread, args.mirrorToManager);
  }
  return {
    sent: twilio.sent,
    channel: twilio.sent ? "twilio" : undefined,
    error: twilio.error,
    sid: twilio.sid,
  };
}

/** True when outbound has a transport (Claw needs no Twilio number). */
export function canSendResidentOutboundSms(fromNumber?: string | null): boolean {
  if (isClawMessengerConfigured()) return true;
  return Boolean(fromNumber?.trim());
}
