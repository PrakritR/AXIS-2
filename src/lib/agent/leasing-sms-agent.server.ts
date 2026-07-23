/**
 * Leasing SMS agent runtime. A session (agent_sessions, kind `leasing_sms`)
 * binds one manager (work-number owner) + one prospect phone. Inbound Twilio
 * texts run a Claude turn with listing tools; replies are sent from the
 * manager's work number via code (never a model tool).
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { track } from "@/lib/analytics/posthog";
import { runAgentTurn } from "@/lib/agent/loop";
import { TIER_MODELS } from "@/lib/agent/model";
import { LEASING_SMS_SYSTEM_PROMPT } from "@/lib/agent/leasing-sms-system-prompt";
import { traceAgentTurn } from "@/lib/observability/langfuse";
import { buildLeasingSmsAgentContext } from "@/lib/tools/context";
import { leasingSmsAgentRegistry } from "@/lib/tools";
import { LEASING_ESCALATE_TOOL_NAME } from "@/lib/tools/domains/leasing-sms";
import { sendFromManagerWorkNumber } from "@/lib/proplane-sms-transport.server";
import { normalizeE164 } from "@/lib/twilio";

type Db = SupabaseClient;

const MAX_INBOUND_PER_HOUR = 30;
const HISTORY_LIMIT = 24;
const SESSION_KIND = "leasing_sms";

/** Merge consecutive same-role rows; drop a leading assistant turn for API alternation. */
function buildAlternatingHistory(
  rows: { role: string; content: string }[],
): Anthropic.MessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const row of rows) {
    const role = row.role === "assistant" ? "assistant" : "user";
    const content = row.content.trim();
    if (!content) continue;
    const last = out.at(-1);
    if (last && last.role === role) {
      last.content = `${last.content}\n${content}`;
    } else {
      out.push({ role, content });
    }
  }
  while (out[0] && out[0].role === "assistant") out.shift();
  return out;
}

export type LeasingSmsSessionRow = {
  id: string;
  landlord_id: string;
  kind: string;
  vendor_phone_e164: string | null;
  status: string;
};

const SESSION_COLUMNS = "id, landlord_id, kind, vendor_phone_e164, status";

export async function findOrCreateLeasingSmsSession(
  db: Db,
  args: { landlordId: string; prospectPhoneE164: string },
): Promise<LeasingSmsSessionRow | null> {
  const landlordId = args.landlordId.trim();
  const phone = normalizeE164(args.prospectPhoneE164) ?? args.prospectPhoneE164.trim();
  if (!landlordId || !phone) return null;

  const { data: existing } = await db
    .from("agent_sessions")
    .select(SESSION_COLUMNS)
    .eq("kind", SESSION_KIND)
    .eq("landlord_id", landlordId)
    .eq("vendor_phone_e164", phone)
    .maybeSingle();
  if (existing) {
    const row = existing as LeasingSmsSessionRow;
    if (row.status === "closed") {
      await db
        .from("agent_sessions")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      return { ...row, status: "active" };
    }
    return row;
  }

  const { data: created, error } = await db
    .from("agent_sessions")
    .insert({
      landlord_id: landlordId,
      user_id: null,
      kind: SESSION_KIND,
      vendor_phone_e164: phone,
      status: "active",
    })
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) {
    // Race: unique index — re-read.
    if (error.code === "23505") {
      const { data: raced } = await db
        .from("agent_sessions")
        .select(SESSION_COLUMNS)
        .eq("kind", SESSION_KIND)
        .eq("landlord_id", landlordId)
        .eq("vendor_phone_e164", phone)
        .maybeSingle();
      return (raced as LeasingSmsSessionRow | null) ?? null;
    }
    console.error("leasing-sms session create failed", error.message);
    return null;
  }
  return (created as LeasingSmsSessionRow | null) ?? null;
}

/**
 * Run one leasing-SMS turn and return the assistant reply text (caller sends SMS).
 * Returns null when suppressed (rate cap, missing API key, empty body).
 */
export async function runLeasingSmsAgentTurn(
  db: Db,
  args: {
    landlordId: string;
    prospectPhoneE164: string;
    inboundText: string;
    workNumber?: string | null;
    /** True on the shared Claw line — lets listing tools span the whole public catalog. */
    crossCatalog?: boolean;
  },
): Promise<{ reply: string; sessionId: string } | null> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;

  const text = args.inboundText.trim().slice(0, 2000);
  if (!text) return null;

  const session = await findOrCreateLeasingSmsSession(db, {
    landlordId: args.landlordId,
    prospectPhoneE164: args.prospectPhoneE164,
  });
  if (!session) return null;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("agent_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .eq("role", "user")
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= MAX_INBOUND_PER_HOUR) {
    console.error("leasing-sms turn suppressed: hourly cap", session.id);
    return null;
  }

  const nowIso = new Date().toISOString();
  await db.from("agent_messages").insert({
    session_id: session.id,
    landlord_id: session.landlord_id,
    role: "user",
    content: text,
    channel: "sms",
  });
  track("leasing_sms_message_in", session.landlord_id, { channel: "sms" });

  const { data: historyRows } = await db
    .from("agent_messages")
    .select("role, content")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = buildAlternatingHistory(
    ((historyRows ?? []) as { role: string; content: string }[]).reverse(),
  ) as Anthropic.MessageParam[];
  if (history.length === 0 || history.at(-1)!.role !== "user") {
    history.push({ role: "user", content: text });
  }

  const prospectPhone =
    normalizeE164(args.prospectPhoneE164) ?? args.prospectPhoneE164.trim();
  const ctx = buildLeasingSmsAgentContext(db, {
    landlordId: session.landlord_id,
    scope: {
      sessionId: session.id,
      prospectPhoneE164: prospectPhone,
      workNumber: args.workNumber?.trim() || null,
      crossCatalog: args.crossCatalog === true,
    },
  });

  let result;
  try {
    result = await traceAgentTurn(
      ctx,
      history as { role: string; content: string }[],
      (observer) =>
        runAgentTurn({
          ctx,
          registry: leasingSmsAgentRegistry,
          messages: history,
          observer,
          system: LEASING_SMS_SYSTEM_PROMPT,
          model: { model: TIER_MODELS.standard, tier: "standard" },
          readOnly: true,
          allowWriteTools: [LEASING_ESCALATE_TOOL_NAME],
        }),
      { name: "leasing-sms-agent-turn", sessionId: session.id },
    );
  } catch (e) {
    console.error("leasing-sms agent turn failed", session.id, e);
    return null;
  }

  const reply = result.reply.trim().slice(0, 1500);
  if (!reply) return null;

  await db.from("agent_messages").insert({
    session_id: session.id,
    landlord_id: session.landlord_id,
    role: "assistant",
    content: reply,
    channel: "agent",
    tool_trace: result.toolTrace,
  });
  await db.from("agent_sessions").update({ updated_at: nowIso }).eq("id", session.id);
  track("leasing_sms_message_out", session.landlord_id, {
    channel: "sms",
    tools: result.toolTrace.length,
  });

  return { reply, sessionId: session.id };
}

/** Send the leasing agent reply from the manager work number (logs to Communication SMS). */
export async function deliverLeasingSmsReply(args: {
  landlordId: string;
  toPhone: string;
  text: string;
  workNumber?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  return sendFromManagerWorkNumber({
    managerUserId: args.landlordId,
    to: args.toPhone,
    text: args.text,
    fromNumber: args.workNumber,
    source: "automated",
  });
}
