/**
 * Twilio inbound SMS webhook — the vendor agent's after-hours front door.
 * Returns empty TwiML immediately and runs the agent turn via after(), so
 * Twilio's response window is never a constraint. Configure the Messaging
 * webhook (POST) to {APP_URL}/api/webhooks/twilio/sms and enable Advanced
 * Opt-Out in the console (it sends the STOP compliance reply; we only record
 * the opt-out and unbind the number).
 */
import { after } from "next/server";
import twilio from "twilio";
import { findVendorAgentSessionByPhone, runVendorAgentSessionTurn } from "@/lib/agent/vendor-agent.server";
import { resolveAppOrigin } from "@/lib/app-url";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { normalizeE164 } from "@/lib/twilio";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_WORDS = new Set(["START", "YES", "UNSTOP"]);

function twiml(): Response {
  return new Response(EMPTY_TWIML, { status: 200, headers: { "Content-Type": "text/xml" } });
}

function maskedPhone(phone: string): string {
  return `${phone.slice(0, 5)}***${phone.slice(-2)}`;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  const signature = req.headers.get("x-twilio-signature");
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

  // Signature over the exact URL Twilio was configured with. Only local dev
  // may run unsigned — any deployed environment fails closed (Checkr precedent).
  // Set TWILIO_WEBHOOK_URL when a proxy rewrites the request origin.
  if (!authToken || !signature) {
    if (process.env.VERCEL) return new Response("Forbidden", { status: 403 });
  } else {
    const url = process.env.TWILIO_WEBHOOK_URL?.trim() || `${resolveAppOrigin(req)}/api/webhooks/twilio/sms`;
    if (!twilio.validateRequest(authToken, signature, url, params)) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const from = normalizeE164(String(params.From ?? "")) ?? "";
  const body = String(params.Body ?? "").trim();
  if (!from || !body) return twiml();

  // Per-phone rate limit. Over-limit still gets a 200 — a non-2xx makes Twilio
  // retry, which would amplify a flood instead of shedding it.
  if (!rateLimit(`twilio-sms:${from}`, 10, 60_000).ok) {
    console.warn("twilio sms rate-limited", maskedPhone(from));
    return twiml();
  }

  const db = createSupabaseServiceRoleClient();
  const keyword = body.toUpperCase().replace(/[.!?]/g, "").trim();

  if (STOP_WORDS.has(keyword)) {
    const { data: sessions } = await db
      .from("agent_sessions")
      .select("vendor_user_id")
      .eq("kind", "vendor_work_order")
      .eq("vendor_phone_e164", from);
    const vendorIds = [...new Set((sessions ?? []).map((s) => s.vendor_user_id as string | null).filter(Boolean))] as string[];
    if (vendorIds.length > 0) {
      await db.from("profiles").update({ sms_opt_out_at: new Date().toISOString() }).in("id", vendorIds);
    }
    // Unbind the number instead of closing sessions: STOP ends the SMS channel,
    // not the in-app conversation.
    await db
      .from("agent_sessions")
      .update({ vendor_phone_e164: null, updated_at: new Date().toISOString() })
      .eq("kind", "vendor_work_order")
      .eq("vendor_phone_e164", from);
    return twiml();
  }

  if (START_WORDS.has(keyword)) {
    const { data: profs } = await db.from("profiles").select("id").eq("phone", from);
    const ids = ((profs ?? []) as { id: string }[]).map((p) => p.id);
    if (ids.length > 0) {
      await db.from("profiles").update({ sms_opt_out_at: null }).in("id", ids);
    }
    // ponytail: sessions re-bind the number on the next dispatch; no back-bind here.
    return twiml();
  }

  const session = await findVendorAgentSessionByPhone(db, from);
  if (!session) {
    // Silent drop: replying to unknown numbers turns us into an SMS echo
    // service and a cost amplifier. Nothing actionable to audit either.
    console.warn("twilio sms from unknown number, dropped", maskedPhone(from));
    return twiml();
  }

  const task = () =>
    runVendorAgentSessionTurn(db, session, body, "sms").catch((e) =>
      console.error("vendor-agent sms turn failed", session.id, e),
    );
  try {
    after(task);
  } catch {
    void task();
  }
  return twiml();
}
