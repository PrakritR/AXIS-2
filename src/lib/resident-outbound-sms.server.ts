/**
 * Resident outbound SMS — Twilio from the manager work number.
 *
 * Claw Messenger is opt-in legacy only (`CLAW_MESSENGER_ENABLED=1`).
 */

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
import { isClawTransportEnabled, sendPropLaneSms } from "@/lib/proplane-sms-transport.server";
import { isPhoneOptedOut } from "@/lib/sms-consent";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { normalizeE164 } from "@/lib/twilio";
import { normalizeE164Us } from "@/lib/claw-messenger.server";

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

async function maybeOpenThread(
  toNorm: string,
  thread?: ResidentOutboundThreadOpts | null,
  bumpLastMessage?: boolean,
): Promise<void> {
  if (!thread?.managerUserId) return;
  try {
    await openClawResidentThread({
      managerUserId: thread.managerUserId,
      residentPhone: toNorm,
      residentUserId: thread.residentUserId,
      residentEmail: thread.residentEmail,
      topic: thread.topic,
      bumpLastMessage,
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
 * Send a text to a resident phone via Twilio (manager `sms_from_number`).
 *
 * Pass `openThread` after payment/lease/move-in SMS so the manager can reply
 * from their personal phone on the same conversation.
 *
 * Honors STOP opt-out unless `skipOptOutCheck`.
 */
export async function sendResidentOutboundSms(args: {
  to: string;
  text: string;
  /** Twilio From — manager `sms_from_number`. Required for production. */
  fromNumber?: string | null;
  skipOptOutCheck?: boolean;
  /** Open/refresh durable manager↔resident thread after a successful send. */
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
  let text = args.text.trim();
  if (!text) return { sent: false, error: "empty_body" };

  // `undefined` → infer from openThread; explicit `null` → skip (caller already linked).
  const linkKind =
    args.linkKind === undefined
      ? args.openThread?.topic
        ? smsLinkKindForThreadTopic(args.openThread.topic)
        : null
      : args.linkKind;
  const linked = linkKind ? ensureSmsIncludesPortalLink(text, linkKind) : text;
  if (linked !== text) {
    // Reserve room for the appended deep link so trimming a long body never
    // cuts the URL mid-link.
    const appended = linked.slice(text.length);
    const budget = Math.max(1, 480 - appended.length);
    text = `${trimSmsBody(text, budget)}${appended}`;
  } else {
    text = trimSmsBody(linked);
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

  const result = await sendPropLaneSms({
    to: toNorm,
    text,
    fromNumber: args.fromNumber,
  });

  if (result.ok) {
    await maybeOpenThread(toNorm, args.openThread, args.mirrorToManager === false);
    await maybeMirrorToManager(toNorm, text, args.openThread, args.mirrorToManager);
  }

  return {
    sent: result.ok,
    channel: result.channel,
    error: result.error,
    sid: result.sid,
  };
}

/** True when outbound has a transport (Twilio work number, or opt-in Claw). */
export function canSendResidentOutboundSms(fromNumber?: string | null): boolean {
  if (fromNumber?.trim()) return true;
  return isClawTransportEnabled();
}
