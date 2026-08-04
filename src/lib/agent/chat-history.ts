import type { ActionPreview } from "@/lib/tools/registry";
import type { AgentPortal } from "@/lib/tools/pending-actions";

export const PORTAL_CHAT_SESSION_KIND = "portal_chat";
export const MODAL_CHAT_SESSION_KIND = "modal_chat";
export const AGENT_CHAT_HISTORY_PAGE_SIZE = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AgentChatHistoryActor = {
  userId: string;
  // Session persistence already uses a service-role client, whose queries must
  // be actor-scoped in every call below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
};

export type AgentChatThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type AgentChatTranscript = {
  id: string;
  title: string;
  updatedAt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  pendingAction: { id: string; preview: ActionPreview } | null;
};

function fallbackTitle(title: unknown): string {
  const value = String(title ?? "").trim();
  return value || "New conversation";
}

function validCursor(cursor: string | null): string | null {
  if (!cursor) return null;
  return Number.isNaN(Date.parse(cursor)) ? null : cursor;
}

export function isAgentChatSessionId(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

/**
 * The session archive is intentionally limited to `portal_chat`; SMS, inbox,
 * and legacy best-effort session rows must never surface in a portal user's
 * history panel.
 */
export async function listAgentChatThreads(
  actor: AgentChatHistoryActor,
  portal: AgentPortal,
  cursor?: string | null,
): Promise<{ threads: AgentChatThreadSummary[]; nextCursor: string | null }> {
  try {
    let query = actor.db
      .from("agent_sessions")
      .select("id, title, updated_at")
      .eq("user_id", actor.userId)
      .eq("portal", portal)
      .eq("kind", PORTAL_CHAT_SESSION_KIND)
      .order("updated_at", { ascending: false })
      .limit(AGENT_CHAT_HISTORY_PAGE_SIZE + 1);
    const before = validCursor(cursor ?? null);
    if (before) query = query.lt("updated_at", before);
    const { data, error } = await query;
    if (error || !data) return { threads: [], nextCursor: null };
    const rows = data as { id: string; title?: string | null; updated_at?: string | null }[];
    const visible = rows.slice(0, AGENT_CHAT_HISTORY_PAGE_SIZE).map((row) => ({
      id: String(row.id),
      title: fallbackTitle(row.title),
      updatedAt: String(row.updated_at ?? ""),
    }));
    return {
      threads: visible,
      nextCursor: rows.length > AGENT_CHAT_HISTORY_PAGE_SIZE ? visible.at(-1)?.updatedAt ?? null : null,
    };
  } catch {
    return { threads: [], nextCursor: null };
  }
}

/** Return a single transcript only after the session's actor + portal + kind match. */
export async function loadAgentChatTranscript(
  actor: AgentChatHistoryActor,
  portal: AgentPortal,
  sessionId: string,
): Promise<AgentChatTranscript | null> {
  if (!isAgentChatSessionId(sessionId)) return null;
  try {
    const { data: session, error: sessionError } = await actor.db
      .from("agent_sessions")
      .select("id, title, updated_at")
      .eq("id", sessionId)
      .eq("user_id", actor.userId)
      .eq("portal", portal)
      .eq("kind", PORTAL_CHAT_SESSION_KIND)
      .maybeSingle();
    if (sessionError || !session?.id) return null;

    const now = new Date().toISOString();
    const [{ data: messageRows, error: messagesError }, { data: actionRows, error: actionsError }] = await Promise.all([
      actor.db.from("agent_messages").select("role, content").eq("session_id", sessionId).order("created_at", { ascending: true }),
      actor.db
        .from("agent_pending_actions")
        .select("id, preview")
        .eq("session_id", sessionId)
        .eq("user_id", actor.userId)
        .eq("portal", portal)
        .eq("status", "proposed")
        .gt("expires_at", now)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (messagesError) return null;
    const messages = ((messageRows ?? []) as { role?: string; content?: string }[])
      .filter((row): row is { role: "user" | "assistant"; content: string } =>
        (row.role === "user" || row.role === "assistant") && typeof row.content === "string" && row.content.trim().length > 0,
      )
      .map((row) => ({ role: row.role, content: row.content }));
    const action = actionsError ? null : (actionRows ?? [])[0] as { id?: string; preview?: ActionPreview } | undefined;
    return {
      id: String(session.id),
      title: fallbackTitle(session.title),
      updatedAt: String(session.updated_at ?? ""),
      messages,
      pendingAction: action?.id && action.preview ? { id: String(action.id), preview: action.preview } : null,
    };
  } catch {
    return null;
  }
}
