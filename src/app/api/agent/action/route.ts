/**
 * The single gated confirm endpoint for every agent write action, across all
 * portals. The client only ever sends an opaque pending-action id + decision;
 * the validated input lives server-side. Confirmation claims the row
 * atomically (exactly-once, expiry-checked, actor-scoped) and re-validates +
 * re-resolves ownership inside the tool's execute().
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { resolveAgentContext } from "@/lib/tools/context";
import { agentRegistry } from "@/lib/tools";
import { executeWriteAction, type ToolRegistry } from "@/lib/tools/registry";
import { claimPendingAction, type PendingActionRow } from "@/lib/tools/pending-actions";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics/posthog";
import { traceAgentAction } from "@/lib/observability/langfuse";
import { appendAgentMessages } from "@/lib/agent/sessions";

export const runtime = "nodejs";

type PortalBinding = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: () => Promise<{ ctx: any; landlordId: string; metadata: Record<string, unknown> } | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registry: ToolRegistry<any>;
};

/**
 * Resolve the full portal context for the claimed row's portal. Each resolver
 * re-derives scope from the authenticated session — the row itself is a
 * carrier, never an authority.
 */
async function bindingForPortal(portal: string): Promise<PortalBinding | null> {
  if (portal === "manager") {
    return {
      resolve: async () => {
        const ctx = await resolveAgentContext();
        if (!ctx) return null;
        return { ctx, landlordId: ctx.landlordId, metadata: { landlordId: ctx.landlordId, role: "manager" } };
      },
      registry: agentRegistry,
    };
  }
  if (portal === "resident") {
    const [{ resolveResidentAgentContext }, { residentAgentRegistry }] = await Promise.all([
      import("@/lib/tools/resident-context"),
      import("@/lib/tools/resident-index"),
    ]);
    return {
      resolve: async () => {
        const ctx = await resolveResidentAgentContext();
        if (!ctx) return null;
        return {
          ctx,
          landlordId: ctx.userId,
          metadata: { role: "resident", managerIds: ctx.managerIds },
        };
      },
      registry: residentAgentRegistry,
    };
  }
  if (portal === "vendor") {
    const [{ resolveVendorAgentContext }, { vendorAgentRegistry }] = await Promise.all([
      import("@/lib/tools/vendor-context"),
      import("@/lib/tools/vendor-index"),
    ]);
    return {
      resolve: async () => {
        const ctx = await resolveVendorAgentContext();
        if (!ctx) return null;
        return {
          ctx,
          landlordId: ctx.userId,
          metadata: { role: "vendor", managerIds: ctx.managerIds },
        };
      },
      registry: vendorAgentRegistry,
    };
  }
  return null;
}

export async function POST(req: Request) {
  const auth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (!rateLimit(`agent-action:${user.id}`, 30, 60_000).ok) {
    return NextResponse.json({ error: "Too many actions — please wait a moment." }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const actionId = String(body.actionId ?? "").trim();
  const decision = body.decision === "cancel" ? "cancel" : body.decision === "confirm" ? "confirm" : null;
  if (!actionId || !decision) {
    return NextResponse.json({ error: "actionId and decision are required." }, { status: 400 });
  }

  const db = createSupabaseServiceRoleClient();

  // Look up the row (actor-scoped — a foreign id is indistinguishable from an
  // unknown one) to learn its portal, then resolve that portal's full context
  // BEFORE claiming, so a failed context resolution never burns the action.
  const { data: rowPeek } = await db
    .from("agent_pending_actions")
    .select("id, portal, tool_name")
    .eq("id", actionId)
    .eq("actor_user_id", user.id)
    .maybeSingle();
  if (!rowPeek) return NextResponse.json({ error: "This action was not found." }, { status: 404 });

  let binding: PortalBinding | null = null;
  try {
    binding = await bindingForPortal(String(rowPeek.portal));
  } catch (e) {
    console.error("[agent/action] portal binding failed:", e);
  }
  if (!binding) return NextResponse.json({ error: "This action was not found." }, { status: 404 });

  const resolved = await binding.resolve();
  if (!resolved || resolved.ctx.userId !== user.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const claim = await claimPendingAction({ userId: user.id, db }, actionId, decision);
  if (!claim.ok) {
    if (claim.reason === "not_found") {
      return NextResponse.json({ error: "This action was not found." }, { status: 404 });
    }
    if (claim.reason === "expired") {
      return NextResponse.json({ error: "This action expired — please ask again." }, { status: 410 });
    }
    return NextResponse.json({ error: "This action was already handled." }, { status: 409 });
  }
  const row: PendingActionRow = claim.row;

  const sessionActor = { userId: user.id, landlordId: resolved.landlordId, db };
  const traceActor = { userId: user.id, metadata: resolved.metadata };
  const portal = row.portal;

  if (decision === "cancel") {
    track("assistant_action_cancelled", user.id, { tool: row.tool_name, portal });
    const reply = "Okay — I won't do that.";
    appendAgentMessages(sessionActor, portal, row.session_id, [
      { role: "assistant", content: reply, toolTrace: [{ tool: row.tool_name, ok: true, cancelled: true }] },
    ]);
    return NextResponse.json({ status: "cancelled", reply });
  }

  try {
    const result = await traceAgentAction(
      traceActor,
      { toolName: row.tool_name, actionId, decision },
      () => executeWriteAction(binding!.registry, resolved.ctx, row.tool_name, row.input),
    );
    if (!result.ok) {
      appendAgentMessages(sessionActor, portal, row.session_id, [
        { role: "assistant", content: result.error, toolTrace: [{ tool: row.tool_name, ok: false }] },
      ]);
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    track("assistant_action_confirmed", user.id, {
      tool: row.tool_name,
      action: row.tool_name,
      portal,
      batch: row.preview?.batchCount ?? 1,
    });
    appendAgentMessages(sessionActor, portal, row.session_id, [
      { role: "assistant", content: result.reply, toolTrace: [{ tool: row.tool_name, ok: true }] },
    ]);
    return NextResponse.json({
      status: "executed",
      reply: result.reply,
      toolTrace: [{ tool: row.tool_name, ok: true }],
      ...(result.checkoutUrl ? { checkoutUrl: result.checkoutUrl } : {}),
    });
  } catch (e) {
    console.error("[agent/action] execute failed:", e);
    return NextResponse.json({ error: "The action failed to execute. Please try again." }, { status: 500 });
  }
}
