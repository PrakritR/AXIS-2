import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the two-way Communication → SMS replica (addendum-2):
 * the manager portal thread must show BOTH sides of a resident/prospect
 * conversation, not just the agent's outbound replies. The known-resident hub
 * path (payment/lease/move-in/general topics) previously never persisted the
 * resident's raw inbound text anywhere the portal reads from — only the
 * leasing-prospect path did. This exercises that specific gap.
 */

const sendFromManager = vi.fn(async () => ({ ok: true, channel: "claw" as const, sid: "SM1" }));
const logManagerSmsMessage = vi.fn(async () => undefined);

vi.mock("@/lib/proplane-sms-transport.server", () => ({
  sendPropLaneSms: vi.fn(async () => ({ ok: true })),
  sendFromManagerWorkNumber: (...args: unknown[]) => sendFromManager(...(args as [unknown])),
}));

vi.mock("@/lib/manager-sms-messages.server", () => ({
  logManagerSmsMessage: (...args: unknown[]) => logManagerSmsMessage(...(args as [unknown, unknown])),
}));

vi.mock("@/lib/claw-relay.server", () => ({
  forwardClawInboundToManagers: vi.fn(async () => ({ forwardedTo: [] })),
  isMappedManagerPhone: vi.fn(async () => false),
  tryRelayManagerReplyViaClaw: vi.fn(async () => ({ relayed: false })),
}));

vi.mock("@/lib/claw-resident-messaging.server", () => ({
  clawMappedManagerEmails: () => [],
  resolveMappedManagerContacts: vi.fn(async () => []),
  resolveRegisteredClawManagers: vi.fn(async () => []),
  findResidentProfileByPhone: vi.fn(async () => ({
    userId: "res-1",
    email: "res@example.com",
    managerUserId: "mgr-1",
  })),
  findThreadByResidentPhone: vi.fn(async () => ({
    id: "thread-1",
    managerUserId: "mgr-1",
    managerPhone: "+15105551111",
    residentPhone: "+15105794001",
    residentUserId: "res-1",
    residentEmail: "res@example.com",
    topic: "general",
    lastMessageAt: new Date(0).toISOString(),
  })),
  forwardResidentMessageToManagers: vi.fn(async () => ({ forwardedTo: [] })),
  mirrorResidentTextToManagerInbox: vi.fn(async () => undefined),
  openClawResidentThread: vi.fn(async () => null),
}));

vi.mock("@/lib/claw-resident-actions.server", () => ({
  runResidentSmsAction: vi.fn(async () => ({
    classification: {
      intent: "balance",
      domain: "payment",
      wantsLabel: "see balance",
      managerPath: "/portal/payments",
      skipManagerBrief: false,
    },
    residentReply: "You're all caught up — nothing due right now.",
    autoFiledNote: null,
    threadTopic: "payment",
    forwardSaid: "what do I owe this month?",
    residentName: "Jane Resident",
    propertyLabel: "4709A 8th Ave NE",
  })),
  buildManagerResidentBrief: vi.fn(() => "brief text"),
}));

vi.mock("@/lib/supabase/service", () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    const self = () => c;
    c.select = self;
    c.eq = self;
    c.in = self;
    c.order = self;
    c.limit = self;
    c.maybeSingle = async () => ({ data: null });
    c.insert = async () => ({ error: null });
    return c;
  };
  return { createSupabaseServiceRoleClient: () => ({ from: () => chain() }) };
});

describe("handleClawLeasingInbound — known resident thread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendFromManager.mockResolvedValue({ ok: true, channel: "claw", sid: "SM1" });
    logManagerSmsMessage.mockResolvedValue(undefined);
  });

  it("persists the resident's raw inbound text (direction=inbound) for the two-way portal thread", async () => {
    const { handleClawLeasingInbound } = await import("@/lib/claw-leasing-bot.server");
    const result = await handleClawLeasingInbound({
      from: "+15105794001",
      text: "what do I owe this month?",
      messageId: "inbound-log-test-1",
      workNumber: "+12053690702",
    });

    expect(result.ok).toBe(true);
    expect(result.replied).toBe(true);
    // The logging call is fire-and-forget (void IIFE) — flush the microtask queue.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logManagerSmsMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        managerUserId: "mgr-1",
        residentUserId: "res-1",
        residentPhone: "+15105794001",
        direction: "inbound",
        body: "what do I owe this month?",
      }),
    );

    // The reply (outbound) is sent separately via sendFromManagerWorkNumber,
    // which the app's own transport layer logs as direction=outbound —
    // together the thread has both sides.
    expect(sendFromManager).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+15105794001",
        managerUserId: "mgr-1",
        text: "You're all caught up — nothing due right now.",
      }),
    );
  });
});
