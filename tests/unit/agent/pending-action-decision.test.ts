/**
 * Unit coverage for `handlePendingActionDecision` scoring: confirm/deny must
 * score `action-approved` on the SERVER-STORED proposal trace, never trust a
 * client-supplied id, and skip scoring when no proposal trace exists.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  denyPendingAction,
  runConfirmedPendingActionForPortal,
  scoreActionApproval,
  traceAgentAction,
  track,
  appendAgentMessages,
} = vi.hoisted(() => ({
  denyPendingAction: vi.fn(),
  runConfirmedPendingActionForPortal: vi.fn(),
  scoreActionApproval: vi.fn(),
  traceAgentAction: vi.fn(),
  track: vi.fn(),
  appendAgentMessages: vi.fn(),
}));

vi.mock("@/lib/tools/pending-actions", () => ({
  denyPendingAction,
}));
vi.mock("@/lib/tools/confirm-gate.server", () => ({
  runConfirmedPendingActionForPortal,
}));
vi.mock("@/lib/observability/langfuse", () => ({
  scoreActionApproval,
  traceAgentAction,
}));
vi.mock("@/lib/analytics/posthog", () => ({ track }));
vi.mock("@/lib/agent/sessions", () => ({ appendAgentMessages }));

import { handlePendingActionDecision } from "@/lib/agent/pending-action-decision";

const ctx = { userId: "user_a", landlordId: "user_a", db: {} as never };
const registry = { get: vi.fn() } as never;

beforeEach(() => {
  vi.clearAllMocks();
  scoreActionApproval.mockResolvedValue(true);
  traceAgentAction.mockImplementation(async (_actor, _info, run) => run());
});

describe("handlePendingActionDecision scoring", () => {
  it("scores action-approved=0 on deny when a proposal trace is stored", async () => {
    denyPendingAction.mockResolvedValue({
      toolName: "send_message",
      input: {},
      portal: "manager",
      sessionId: null,
      proposalTraceId: "lf-proposal-1",
    });

    const res = await handlePendingActionDecision({
      body: { denyActionId: "act-1" },
      ctx,
      registry,
      portal: "manager",
    });
    expect(res?.status).toBe(200);
    expect(scoreActionApproval).toHaveBeenCalledWith({
      traceId: "lf-proposal-1",
      approved: false,
      actionId: "act-1",
      toolName: "send_message",
    });
    expect(traceAgentAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decision: "cancel", actionId: "act-1", proposalTraceId: "lf-proposal-1" }),
      expect.any(Function),
    );
  });

  it("does not score when deny has no proposal trace (tour proposals)", async () => {
    denyPendingAction.mockResolvedValue({
      toolName: "confirm_tour_inquiry",
      input: {},
      portal: "manager",
      sessionId: null,
      proposalTraceId: null,
    });
    await handlePendingActionDecision({
      body: { denyActionId: "act-tour" },
      ctx,
      registry,
      portal: "manager",
    });
    expect(scoreActionApproval).not.toHaveBeenCalled();
  });

  it("scores action-approved=1 on confirm using the claim's proposalTraceId", async () => {
    runConfirmedPendingActionForPortal.mockResolvedValue({
      ok: true,
      reply: "Done.",
      toolName: "send_message",
      sessionId: "sess-1",
      proposalTraceId: "lf-proposal-2",
    });

    const res = await handlePendingActionDecision({
      body: { confirmActionId: "act-2" },
      ctx,
      registry,
      portal: "manager",
    });
    expect(res?.status).toBe(200);
    expect(scoreActionApproval).toHaveBeenCalledWith({
      traceId: "lf-proposal-2",
      approved: true,
      actionId: "act-2",
      toolName: "send_message",
    });
  });

  it("returns null for ordinary chat bodies", async () => {
    const res = await handlePendingActionDecision({
      body: { messages: [] },
      ctx,
      registry,
      portal: "manager",
    });
    expect(res).toBeNull();
  });
});
