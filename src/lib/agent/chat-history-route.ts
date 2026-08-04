import { NextResponse } from "next/server";
import type { AgentPortal } from "@/lib/tools/pending-actions";
import {
  isAgentChatSessionId,
  listAgentChatThreads,
  loadAgentChatTranscript,
  type AgentChatHistoryActor,
} from "@/lib/agent/chat-history";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

/** Shared GET behavior for the three role-scoped chat endpoints. */
export async function handleAgentChatHistoryRequest(
  req: Request,
  actor: AgentChatHistoryActor,
  portal: AgentPortal,
): Promise<NextResponse> {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (sessionId) {
    if (!isAgentChatSessionId(sessionId)) {
      return NextResponse.json({ error: "Invalid conversation." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const conversation = await loadAgentChatTranscript(actor, portal, sessionId);
    if (!conversation) {
      // Do not distinguish another user's session from an unknown id.
      return NextResponse.json({ error: "Conversation not found." }, { status: 404, headers: PRIVATE_HEADERS });
    }
    return NextResponse.json({ conversation }, { headers: PRIVATE_HEADERS });
  }

  const { threads, nextCursor, error } = await listAgentChatThreads(actor, portal, url.searchParams.get("cursor"));
  if (error) return NextResponse.json({ error }, { status: 503, headers: PRIVATE_HEADERS });
  return NextResponse.json({ threads, nextCursor }, { headers: PRIVATE_HEADERS });
}
