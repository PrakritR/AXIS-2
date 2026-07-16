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
import {
  isClawSharedLineBridgeEnabled,
  isLegacyClawSharedSmsNumber,
  managerContactSmsPhoneForPublicCta,
} from "@/lib/claw-leasing-links";
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

async function logOutboundIfNeeded(args: {
  log?: {
    managerUserId: string;
    residentUserId?: string | null;
    residentPhone?: string | null;
    source?: "work_number" | "relay" | "automated";
  } | null;
  to: string;
  text: string;
  fromPhone: string | null;
  messageSid?: string | null;
}): Promise<void> {
  if (!args.log?.managerUserId) return;
  try {
    const db = createSupabaseServiceRoleClient();
    const { logManagerSmsMessage } = await import("@/lib/manager-sms-messages.server");
    await logManagerSmsMessage(db, {
      managerUserId: args.log.managerUserId,
      residentUserId: args.log.residentUserId,
      residentPhone: args.log.residentPhone ?? args.to,
      direction: "outbound",
      body: args.text,
      fromPhone: args.fromPhone,
      toPhone: args.to,
      messageSid: args.messageSid ?? null,
      source: args.log.source ?? "work_number",
    });
  } catch (e) {
    console.error("logOutboundIfNeeded failed", e instanceof Error ? e.message : e);
  }
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
  /**
   * When set, logs outbound SMS for the Communication → SMS → Sent tab.
   * Pass `null` to skip (e.g. manager carbon-copy mirrors).
   */
  log?: {
    managerUserId: string;
    residentUserId?: string | null;
    residentPhone?: string | null;
    source?: "work_number" | "relay" | "automated";
  } | null;
}): Promise<PropLaneSmsResult> {
  const text = args.text.trim();
  if (!text) return { ok: false, error: "empty_body" };
  const to = normalizeTo(args.to);
  if (!to) return { ok: false, error: "invalid_to" };

  const from = managerContactSmsPhoneForPublicCta(args.fromNumber);
  // Shared Claw agent line → Claw transport (not Twilio From).
  if (from && isLegacyClawSharedSmsNumber(from) && isClawTransportEnabled()) {
    await registerClawMessengerRoute(to);
    const claw = await sendClawMessengerText({ to, text });
    if (claw.ok) {
      await logOutboundIfNeeded({
        log: args.log,
        to,
        text,
        fromPhone: from,
        messageSid: claw.messageId,
      });
    }
    return {
      ok: claw.ok,
      channel: claw.ok ? "claw" : undefined,
      sid: claw.messageId,
      error: claw.ok ? undefined : claw.error,
    };
  }
  if (from) {
    const twilio = await sendSms(to, text, from);
    if (twilio.sent) {
      await logOutboundIfNeeded({
        log: args.log,
        to,
        text,
        fromPhone: from,
        messageSid: twilio.sid,
      });
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
  if (claw.ok) {
    await logOutboundIfNeeded({
      log: args.log,
      to,
      text,
      fromPhone: from,
      messageSid: claw.messageId,
    });
  }
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
  residentUserId?: string | null;
  source?: "work_number" | "relay" | "automated";
  /** Skip Communication → SMS Sent logging (manager mirror copies). */
  skipLog?: boolean;
}): Promise<PropLaneSmsResult> {
  const managerUserId = args.managerUserId.trim();
  if (!managerUserId) return { ok: false, error: "missing_manager" };

  let from = managerContactSmsPhoneForPublicCta(args.fromNumber);
  if (!from) {
    try {
      const db = createSupabaseServiceRoleClient();
      const { data } = await db
        .from("profiles")
        .select("sms_from_number")
        .eq("id", managerUserId)
        .maybeSingle();
      const raw = String(data?.sms_from_number ?? "").trim();
      from = managerContactSmsPhoneForPublicCta(raw);
      // Do not auto-buy Twilio while the Claw bridge is covering opted-in
      // managers. Once the bridge is off, ensureManagerSmsNumber handles every
      // stale stamp itself (legacy Claw line, 555 placeholder, empty) — do not
      // pre-filter here or legacy-stamped profiles get stranded with no
      // transport at all.
      if (!from && !isClawSharedLineBridgeEnabled()) {
        const { ensureManagerSmsNumber } = await import("@/lib/twilio-provisioning");
        const provisioned = await ensureManagerSmsNumber(db, managerUserId);
        if (provisioned.ok) from = managerContactSmsPhoneForPublicCta(provisioned.number);
      }
    } catch {
      from = null;
    }
  }

  return sendPropLaneSms({
    to: args.to,
    text: args.text,
    fromNumber: from,
    log: args.skipLog
      ? null
      : {
          managerUserId,
          residentUserId: args.residentUserId,
          residentPhone: args.to,
          source: args.source ?? "work_number",
        },
  });
}

/**
 * Fire-and-forget: buy/assign a Twilio work number after manager signup.
 * No-op while the Claw shared-line bridge is on (A2P pending) — new accounts
 * get messaging setup later.
 */
export function scheduleManagerMessagingReady(managerUserId: string): void {
  const uid = managerUserId.trim();
  if (!uid) return;
  if (isClawSharedLineBridgeEnabled()) return;

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
