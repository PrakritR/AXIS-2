/**
 * PropLane SMS transport — Claw Messenger is the production source of truth
 * (one shared agent line). Twilio is a future per-manager endeavour and is
 * only used when Claw is explicitly disabled.
 */

import { after } from "next/server";
import {
  isClawMessengerConfigured,
  normalizeE164Us,
  registerClawMessengerRoute,
  sendClawMessengerText,
} from "@/lib/claw-messenger.server";
import {
  clawLeasingAgentPhoneE164,
  isClawSharedLineBridgeEnabled,
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

/** True when Claw Messenger is configured for PropLane messaging. */
export function isClawTransportEnabled(): boolean {
  return isClawMessengerConfigured();
}

/**
 * Send an SMS. Claw-primary: always send via the shared agent line.
 * Twilio is only attempted when Claw is disabled (future per-manager numbers).
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

  // Claw-primary: one agent line runs the entire messaging system.
  if (isClawTransportEnabled()) {
    const from = clawLeasingAgentPhoneE164();
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

  // Future Twilio path (Claw disabled).
  const from = managerContactSmsPhoneForPublicCta(args.fromNumber);
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
    return { ok: false, channel: "twilio", error: twilio.error || "twilio_send_failed" };
  }

  return { ok: false, error: "missing_from" };
}

/**
 * Send from the PropLane messaging number for this manager.
 * Under Claw-primary that is always the shared agent line.
 */
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

  let from: string | null = null;
  if (isClawTransportEnabled() || isClawSharedLineBridgeEnabled()) {
    from = clawLeasingAgentPhoneE164();
  } else {
    from = managerContactSmsPhoneForPublicCta(args.fromNumber);
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
        if (!from) {
          const { ensureManagerSmsNumber } = await import("@/lib/twilio-provisioning");
          const provisioned = await ensureManagerSmsNumber(db, managerUserId);
          if (provisioned.ok) from = managerContactSmsPhoneForPublicCta(provisioned.number);
        }
      } catch {
        from = null;
      }
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
 * Stamp the shared Claw agent line on the manager (Claw-primary), or buy a
 * Twilio work number when Claw is off (future).
 */
export function scheduleManagerMessagingReady(managerUserId: string): void {
  const uid = managerUserId.trim();
  if (!uid) return;

  const run = async () => {
    try {
      const db = createSupabaseServiceRoleClient();
      if (isClawSharedLineBridgeEnabled() || isClawTransportEnabled()) {
        const agent = clawLeasingAgentPhoneE164();
        await db
          .from("profiles")
          .update({ sms_from_number: agent, updated_at: new Date().toISOString() })
          .eq("id", uid);
        return;
      }
      const { ensureManagerSmsNumber } = await import("@/lib/twilio-provisioning");
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
