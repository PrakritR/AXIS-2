/**
 * Conversation persistence into the (previously unwired) agent_sessions /
 * agent_messages tables, so sessions are replayable and failed/thumbs-down
 * turns can feed the eval set. A successful portal turn writes its transcript
 * before its response is returned, so a just-finished chat is immediately
 * recoverable from the server archive. Persistence remains fail-soft: a
 * logging outage must not turn a valid assistant reply into an error.
 */
import type { AgentPortal } from "@/lib/tools/pending-actions";
import { PORTAL_CHAT_SESSION_KIND } from "@/lib/agent/chat-history";

type SessionActor = {
  userId: string;
  /** agent_sessions.landlord_id scope: manager id for manager sessions, the
   * actor's own user id for resident/vendor sessions. */
  landlordId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A concise, server-owned title for archive list rows. */
export function agentChatThreadTitle(text: string): string {
  const stripped = text.replace(/^\[Context:[^\]]+\]\s*\n+/i, "").trim();
  const line = stripped.split("\n")[0]?.trim() ?? "";
  if (!line) return "New conversation";
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

/**
 * Reuse the supplied session when it exists AND belongs to this actor;
 * otherwise create a fresh one. Never trusts an unowned id. Returns null when
 * persistence is unavailable — callers treat that as "no session".
 */
export async function ensureAgentSession(
  actor: SessionActor,
  portal: AgentPortal,
  opts: { sessionId?: string | null; title?: string | null; kind?: string } = {},
): Promise<string | null> {
  try {
    const kind = opts.kind?.trim() || PORTAL_CHAT_SESSION_KIND;
    const candidate = String(opts.sessionId ?? "").trim();
    if (candidate && UUID_RE.test(candidate)) {
      const { data } = await actor.db
        .from("agent_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", candidate)
        .eq("user_id", actor.userId)
        .eq("portal", portal)
        .eq("kind", kind)
        .select("id")
        .maybeSingle();
      if (data?.id) return String(data.id);
    }
    const { data: created } = await actor.db
      .from("agent_sessions")
      .insert({
        landlord_id: actor.landlordId,
        user_id: actor.userId,
        portal,
        kind,
        title: agentChatThreadTitle(opts.title ?? ""),
      })
      .select("id")
      .single();
    return created?.id ? String(created.id) : null;
  } catch {
    return null;
  }
}

/**
 * Append a completed turn before responding, keeping the archive immediately
 * consistent for a refresh, layout switch, or cross-device reopen.
 */
export async function appendAgentMessages(
  actor: SessionActor,
  portal: AgentPortal,
  sessionId: string | null,
  rows: { role: "user" | "assistant"; content: string; toolTrace?: unknown }[],
  opts: { kind?: string } = {},
): Promise<void> {
  if (!sessionId || rows.length === 0) return;
  try {
    const kind = opts.kind?.trim() || PORTAL_CHAT_SESSION_KIND;
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
    await actor.db
      .from("agent_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("user_id", actor.userId)
      .eq("portal", portal)
      .eq("kind", kind);
  } catch {
    /* persistence must not break a valid assistant response */
  }
}
