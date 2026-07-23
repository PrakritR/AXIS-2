import { NextResponse } from "next/server";
import { resolveAgentContext } from "@/lib/tools/context";
import { denyPendingAction, listProposedActionsForUser } from "@/lib/tools/pending-actions";
import { runConfirmedPendingAction } from "@/lib/tools/confirm-gate.server";
import { CONFIRM_TOUR_INQUIRY_TOOL } from "@/lib/tour-proposal.server";
import { track } from "@/lib/analytics/posthog";

export const runtime = "nodejs";

/**
 * The standalone approval surface for approval-first automated tours. It reuses
 * `agent_pending_actions` and the same confirm gate the assistant uses: GET
 * lists the manager's open tour proposals; POST approves (runs the gated
 * `confirm_tour_inquiry` handler) or discards (denies the proposal). Nothing
 * books or emails the tenant until the manager approves here.
 */
export async function GET() {
  const ctx = await resolveAgentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const actions = await listProposedActionsForUser(ctx.db, {
    userId: ctx.userId,
    toolName: CONFIRM_TOUR_INQUIRY_TOOL,
  });
  // Only the id + preview leave the server; the stored input never does.
  return NextResponse.json({
    proposals: actions.map((action) => ({ id: action.id, preview: action.preview, createdAt: action.createdAt })),
  });
}

export async function POST(req: Request) {
  const ctx = await resolveAgentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const actionId = typeof body.actionId === "string" ? body.actionId.trim() : "";
  const decision = typeof body.decision === "string" ? body.decision : "";
  if (!actionId || (decision !== "approve" && decision !== "discard")) {
    return NextResponse.json({ error: "actionId and decision (approve|discard) required." }, { status: 400 });
  }

  if (decision === "discard") {
    const denied = await denyPendingAction(ctx, actionId);
    track("assistant_action_denied", ctx.userId, { known: denied, action: CONFIRM_TOUR_INQUIRY_TOOL });
    return NextResponse.json({ ok: true, reply: "Proposal discarded. Nothing was booked or sent." });
  }

  const result = await runConfirmedPendingAction(ctx, actionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  track("assistant_action_confirmed", ctx.userId, { action: result.toolName });
  return NextResponse.json({ ok: true, reply: result.reply });
}
