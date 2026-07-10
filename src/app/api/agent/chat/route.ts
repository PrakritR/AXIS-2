import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { resolveAgentContext } from "@/lib/tools/context";
import { agentRegistry } from "@/lib/tools";
import { runAgentTurn } from "@/lib/agent/loop";
import { executeSendRentReminder } from "@/lib/tools/domains/payments";
import { filterOverdueCharges, buildRentReminderPreview } from "@/lib/tools/domains/payments-logic";
import { loadAllManagerRows } from "@/lib/tools/domains/load-manager-rows";
import type { HouseholdCharge } from "@/lib/household-charges";
import { track } from "@/lib/analytics/posthog";
import { traceAgentTurn } from "@/lib/observability/langfuse";
import { executeDispatch } from "@/lib/work-order-dispatch.server";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const ctx = await resolveAgentContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // Gated write path: re-resolve the action server-side by id; the client preview
  // is never trusted. This is the fix for the write-gating bypass from the review.
  const confirmAction = body.confirmAction as
    | { type?: string; chargeId?: unknown; workOrderId?: unknown }
    | undefined;

  if (confirmAction?.type === "dispatch_work_order") {
    const workOrderId = String(confirmAction.workOrderId ?? "").trim();
    try {
      const result = await executeDispatch(ctx.db, {
        workOrderId,
        landlordId: ctx.landlordId,
        actor: { userId: ctx.userId, email: ctx.email, fullName: "" },
        decidedBy: "manager",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status >= 500 ? 500 : 400 });
      }
      track("assistant_action_confirmed", ctx.userId, { action: "dispatch_work_order" });
      const reply = result.scheduledIso
        ? `Dispatched ${result.vendorName} and booked their next open slot. They've been notified.`
        : `Dispatched ${result.vendorName}. No availability was on file, so pick a visit time from Work orders.`;
      return NextResponse.json({ reply, toolTrace: [{ tool: "dispatch_work_order", ok: true }] });
    } catch (e) {
      console.error("[agent/chat] dispatch confirm failed:", e);
      return NextResponse.json({ error: "The assistant ran into an error. Please try again." }, { status: 500 });
    }
  }
  if (confirmAction?.type === "send_rent_reminder") {
    const chargeId = String(confirmAction.chargeId ?? "").trim();
    try {
      const result = await executeSendRentReminder(ctx, chargeId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      track("assistant_action_confirmed", ctx.userId, { action: "send_rent_reminder", delivery: result.delivery });
      const name = result.preview.residentName;
      const reply =
        result.delivery === "emailed"
          ? `Payment reminder emailed to ${name}.`
          : result.delivery === "already_sent"
            ? `A reminder was already sent to ${name} today; nothing new was sent.`
            : result.delivery === "email_failed"
              ? `Recorded the reminder for ${name}, but the email failed to send. Please try again.`
              : `Recorded a payment reminder for ${name} in the portal (no email is configured).`;
      return NextResponse.json({ reply, toolTrace: [{ tool: "send_rent_reminder", ok: true }] });
    } catch (e) {
      console.error("[agent/chat] confirm action failed:", e);
      return NextResponse.json({ error: "The assistant ran into an error. Please try again." }, { status: 500 });
    }
  }

  const rawMessages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
  const messages: Anthropic.MessageParam[] = rawMessages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  }

  try {
    const result = await traceAgentTurn(ctx, messages as ChatMessage[], (observer) =>
      runAgentTurn({ ctx, registry: agentRegistry, messages, observer }),
    );
    track("assistant_message_sent", ctx.userId, {
      tools: result.toolTrace.length,
      model: result.model,
      tier: result.tier,
    });

    const lastUserText = String(rawMessages.at(-1)?.content ?? "").toLowerCase();
    const askedToSend = /\b(send|remind|reminder|notify)\b/.test(lastUserText);
    const fetchedOverdue = result.toolTrace.some((t) => t.tool === "get_overdue_charges" && t.ok);

    if (askedToSend && fetchedOverdue) {
      const charges = await loadAllManagerRows(
        ctx,
        "portal_household_charge_records",
        (rowData) => rowData as HouseholdCharge,
      );
      const overdue = filterOverdueCharges(charges);
      if (overdue.length === 1) {
        const preview = buildRentReminderPreview(overdue[0]!);
        return NextResponse.json({
          ...result,
          pendingConfirm: {
            type: "send_rent_reminder",
            chargeId: preview.chargeId,
            residentName: preview.residentName,
            chargeTitle: preview.chargeTitle,
            balanceDue: preview.balanceDue,
          },
        });
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[agent/chat] turn failed:", e);
    return NextResponse.json({ error: "The assistant ran into an error. Please try again." }, { status: 500 });
  }
}
