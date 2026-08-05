import { NextResponse } from "next/server";

import { track } from "@/lib/analytics/posthog";
import { scoreAgentTrace } from "@/lib/observability/langfuse";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Record a user's thumbs rating for one agent turn.
 *
 * This is the only quality signal the agent has. Langfuse traces record what the
 * agent DID; without a score there is nothing that says whether it was any good,
 * so nothing to rank, alert on, or promote into an eval set. A thumbs-down trace
 * already carries the prompt, the tools offered, the tool chosen, its arguments,
 * and its result — everything needed to replay it as a test case.
 *
 * Open to EVERY signed-in role (manager, resident, vendor), because all three
 * portals mount an assistant and a resident's bad answer is exactly as much of a
 * defect as a manager's.
 *
 * The trace id is not authorization. A caller could otherwise post any id and
 * poison another tenant's quality metrics — or probe which ids exist — so the id
 * is verified against `agent_messages` joined to the caller's OWN
 * `agent_sessions` row before anything is written. An id the caller does not own
 * is answered 404, the same as one that does not exist, so the route is not an
 * existence oracle.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const payload = (body ?? {}) as Record<string, unknown>;

  const traceId = typeof payload.traceId === "string" ? payload.traceId.trim() : "";
  const rating = payload.rating === "up" || payload.rating === "down" ? payload.rating : null;
  // Free text from a user: length-capped here, and never echoed back.
  const comment = typeof payload.comment === "string" ? payload.comment.trim().slice(0, 2000) : undefined;

  if (!traceId || traceId.length > 200) {
    return NextResponse.json({ error: "A trace id is required." }, { status: 400 });
  }
  if (!rating) {
    return NextResponse.json({ error: "Rating must be 'up' or 'down'." }, { status: 400 });
  }

  // RLS denies anon/authenticated on these tables (they are service-role written),
  // so ownership is re-derived here against the caller's own sessions.
  const db = createSupabaseServiceRoleClient();
  const { data: owned, error } = await db
    .from("agent_messages")
    .select("id, session_id, agent_sessions!inner(user_id)")
    .eq("tool_trace->>traceId", traceId)
    .eq("agent_sessions.user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[agent/feedback] ownership lookup failed:", error);
    return NextResponse.json({ error: "Could not record feedback." }, { status: 500 });
  }
  if (!owned) return NextResponse.json({ error: "Unknown turn." }, { status: 404 });

  const scored = await scoreAgentTrace({ traceId, rating, userId: user.id, comment });

  // Mirror the rating into product analytics so thumbs-down rate is visible
  // beside the rest of the funnel without opening Langfuse. Ids and enums only.
  track("assistant_feedback_submitted", user.id, { rating, hasComment: Boolean(comment) });

  // `scored: false` means Langfuse is unconfigured or refused the write. The
  // click still succeeded from the user's point of view, so this is 200 with an
  // honest flag rather than an error the UI would have to explain.
  return NextResponse.json({ ok: true, scored });
}
