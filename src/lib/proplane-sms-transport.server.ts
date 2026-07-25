/**
 * PropLane SMS transport — Twilio is the authoritative primary rail (per-manager
 * work numbers). The Claw Messenger shared agent line is a LEGACY FALLBACK,
 * used only while its flag is engaged (`isClawFallbackEnabled()` /
 * `CLAW_MESSENGER_ENABLED`+key). No flag → Twilio. See `sms-transport-mode.ts`
 * for the single rail decision and `docs/agents/sms-system.md` for the topology.
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
  managerContactSmsPhoneForPublicCta,
} from "@/lib/claw-leasing-links";
import { isClawFallbackEnabled } from "@/lib/sms-transport-mode";
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
    counterpartyRole?: import("@/lib/sms-conversation-identity").SmsCounterpartyRole;
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
      counterpartyRole: args.log.counterpartyRole,
    });
  } catch (e) {
    console.error("logOutboundIfNeeded failed", e instanceof Error ? e.message : e);
  }
}

/**
 * True when the Claw legacy fallback should actually transmit: its flag is
 * engaged AND it is configured with an API key. When false (the default), sends
 * take the primary Twilio rail. This is the server-side send gate; the
 * client-safe rail decision is `smsPrimaryTransport()`.
 */
export function isClawTransportEnabled(): boolean {
  return isClawMessengerConfigured();
}

/**
 * Send an SMS. PRIMARY rail is Twilio (per-manager work number). The Claw
 * shared agent line is only used when the legacy fallback is engaged.
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
    counterpartyRole?: import("@/lib/sms-conversation-identity").SmsCounterpartyRole;
  } | null;
}): Promise<PropLaneSmsResult> {
  const text = args.text.trim();
  if (!text) return { ok: false, error: "empty_body" };
  const to = normalizeTo(args.to);
  if (!to) return { ok: false, error: "invalid_to" };

  // LEGACY FALLBACK — only when the Claw flag is engaged. Routes through the one
  // shared agent line instead of the primary Twilio rail below. Retired by
  // turning the flag off (see sms-transport-mode.ts).
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

  // PRIMARY rail: Twilio from the manager's per-manager work number.
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
 * Send from the PropLane messaging number for this manager — the per-manager
 * Twilio work number on the primary rail. While the Claw legacy fallback is
 * engaged, that is instead the single shared agent line.
 */
export async function sendFromManagerWorkNumber(args: {
  managerUserId: string;
  to: string;
  text: string;
  /** When already known (inbound webhook), skip the profile lookup. */
  fromNumber?: string | null;
  residentUserId?: string | null;
  source?: "work_number" | "relay" | "automated";
  /** The recipient's capacity, so outbound threads under the same
   * conversation identity as their inbound (resident vs prospect). */
  counterpartyRole?: import("@/lib/sms-conversation-identity").SmsCounterpartyRole;
  /** Skip Communication → SMS Sent logging (manager mirror copies). */
  skipLog?: boolean;
}): Promise<PropLaneSmsResult> {
  const managerUserId = args.managerUserId.trim();
  if (!managerUserId) return { ok: false, error: "missing_manager" };

  let from: string | null = null;
  if (isClawTransportEnabled() || isClawFallbackEnabled()) {
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
          counterpartyRole: args.counterpartyRole,
        },
  });
}

/**
 * Make the manager ready to message. While the Claw legacy fallback is engaged,
 * stamp the shared agent line; otherwise buy a per-manager Twilio work number
 * (gated by the `SMS_PROVISIONING_ENABLED` money guard, so this no-ops until
 * firstmate turns provisioning on).
 */
export function scheduleManagerMessagingReady(managerUserId: string): void {
  const uid = managerUserId.trim();
  if (!uid) return;

  const run = async () => {
    try {
      const db = createSupabaseServiceRoleClient();
      if (isClawFallbackEnabled() || isClawTransportEnabled()) {
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
