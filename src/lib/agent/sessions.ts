/**
 * Conversation persistence into the (previously unwired) agent_sessions /
 * agent_messages tables, so sessions are replayable and failed/thumbs-down
 * turns can feed the eval set. Everything here is best-effort: persistence
 * must never fail or slow a turn, so writes run in `after()` and all errors
 * are swallowed.
 */
import { after } from "next/server";
import type { AgentPortal } from "@/lib/tools/pending-actions";

type SessionActor = {
  userId: string;
  /** agent_sessions.landlord_id scope: manager id for manager sessions, the
   * actor's own user id for resident/vendor sessions. */
  landlordId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reuse the supplied session when it exists AND belongs to this actor;
 * otherwise create a fresh one. Never trusts an unowned id. Returns null when
 * persistence is unavailable — callers treat that as "no session".
 */
export async function ensureAgentSession(
  actor: SessionActor,
  portal: AgentPortal,
  sessionId?: string | null,
): Promise<string | null> {
  try {
    const candidate = String(sessionId ?? "").trim();
    if (candidate && UUID_RE.test(candidate)) {
      const { data } = await actor.db
        .from("agent_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", candidate)
        .eq("user_id", actor.userId)
        .select("id")
        .maybeSingle();
      if (data?.id) return String(data.id);
    }
    const { data: created } = await actor.db
      .from("agent_sessions")
      .insert({ landlord_id: actor.landlordId, user_id: actor.userId, portal })
      .select("id")
      .single();
    return created?.id ? String(created.id) : null;
  } catch {
    return null;
  }
}

/**
 * Append turn messages after the response is sent. Fire-and-forget: runs in
 * next/server `after()` so it adds zero latency and can never fail the turn.
 */
export function appendAgentMessages(
  actor: SessionActor,
  portal: AgentPortal,
  sessionId: string | null,
  rows: { role: "user" | "assistant"; content: string; toolTrace?: unknown }[],
): void {
  if (!sessionId || rows.length === 0) return;
  after(async () => {
    try {
      await actor.db.from("agent_messages").insert(
        rows.map((r) => ({
          session_id: sessionId,
          landlord_id: actor.landlordId,
          portal,
          role: r.role,
          content: r.content.slice(0, 20_000),
          tool_trace: r.toolTrace ?? null,
        })),
      );
    } catch {
      /* best-effort */
    }
  });
}
