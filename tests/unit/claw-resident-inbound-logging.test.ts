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
const logManagerSmsMessage = vi.fn(async (): Promise<boolean> => true);
const findResidentProfileByPhone = vi.fn();
const findThreadByResidentPhone = vi.fn();
const openClawResidentThread = vi.fn();

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
  findResidentProfileByPhone: (...args: unknown[]) => findResidentProfileByPhone(...args),
  findThreadByResidentPhone: (...args: unknown[]) => findThreadByResidentPhone(...args),
  forwardResidentMessageToManagers: vi.fn(async () => ({ forwardedTo: [] })),
  mirrorResidentTextToManagerInbox: vi.fn(async () => undefined),
  openClawResidentThread: (...args: unknown[]) => openClawResidentThread(...args),
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
    logManagerSmsMessage.mockResolvedValue(true);
    findResidentProfileByPhone.mockResolvedValue({
      userId: "res-1",
      email: "res@example.com",
      managerUserId: "mgr-1",
    });
    findThreadByResidentPhone.mockResolvedValue({
      id: "thread-1",
      managerUserId: "mgr-1",
      managerPhone: "+15105551111",
      residentPhone: "+15105794001",
      residentUserId: "res-1",
      residentEmail: "res@example.com",
      topic: "general",
      lastMessageAt: new Date(0).toISOString(),
    });
    openClawResidentThread.mockResolvedValue(null);
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

  it("replaces a shared-line thread owned by a different manager before logging inbound", async () => {
    findThreadByResidentPhone.mockResolvedValue({
      id: "stale-thread",
      managerUserId: "mgr-2",
      managerPhone: "+15105552222",
      residentPhone: "+15105794001",
      residentUserId: "res-1",
      residentEmail: "res@example.com",
      topic: "general",
      lastMessageAt: new Date().toISOString(),
    });
    openClawResidentThread.mockResolvedValue({
      id: "correct-thread",
      managerUserId: "mgr-1",
      managerPhone: "+15105551111",
      residentPhone: "+15105794001",
      residentUserId: "res-1",
      residentEmail: "res@example.com",
      topic: "general",
      lastMessageAt: new Date().toISOString(),
    });

    const { handleClawLeasingInbound } = await import("@/lib/claw-leasing-bot.server");
    const result = await handleClawLeasingInbound({
      from: "+15105794001",
      text: "route this to my manager",
      messageId: "inbound-manager-scope-test",
      workNumber: "+12053690702",
    });

    expect(result.ok).toBe(true);
    expect(openClawResidentThread).toHaveBeenCalledWith(
      expect.objectContaining({ managerUserId: "mgr-1" }),
    );
    expect(logManagerSmsMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ managerUserId: "mgr-1" }),
    );
    expect(sendFromManager).toHaveBeenCalledWith(
      expect.objectContaining({ managerUserId: "mgr-1" }),
    );
  });

  it("does not fall through to another landlord when the correct thread cannot open", async () => {
    findThreadByResidentPhone.mockResolvedValue({
      id: "stale-thread",
      managerUserId: "mgr-2",
      managerPhone: "+15105552222",
      residentPhone: "+15105794001",
      residentUserId: "res-1",
      residentEmail: "res@example.com",
      topic: "general",
      lastMessageAt: new Date().toISOString(),
    });

    const { handleClawLeasingInbound } = await import("@/lib/claw-leasing-bot.server");
    const result = await handleClawLeasingInbound({
      from: "+15105794001",
      text: "do not misroute this",
      messageId: "inbound-manager-scope-failure-test",
      workNumber: "+12053690702",
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Resident SMS thread resolution failed.",
    });
    expect(logManagerSmsMessage).not.toHaveBeenCalled();
    expect(sendFromManager).not.toHaveBeenCalled();
  });

  it("dedupes every constituent ID from a merged debounce frame", async () => {
    const { handleClawLeasingInbound } = await import("@/lib/claw-leasing-bot.server");
    const merged = await handleClawLeasingInbound({
      from: "+15105794001",
      text: "first\nsecond",
      messageId: "merged-log-test-2",
      mergedMessageIds: ["merged-log-test-1", "merged-log-test-2"],
      workNumber: "+12053690702",
    });
    const replayedConstituent = await handleClawLeasingInbound({
      from: "+15105794001",
      text: "first",
      messageId: "merged-log-test-1",
      workNumber: "+12053690702",
    });

    expect(merged.replied).toBe(true);
    expect(replayedConstituent.replied).toBe(false);
    expect(sendFromManager).toHaveBeenCalledTimes(1);
  });

  it("releases idempotency when inbound persistence fails so delivery can retry before replying", async () => {
    const { handleClawLeasingInbound } = await import("@/lib/claw-leasing-bot.server");
    logManagerSmsMessage.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const failed = await handleClawLeasingInbound({
      from: "+15105794001",
      text: "retry this",
      messageId: "inbound-log-retry-test",
      workNumber: "+12053690702",
    });
    expect(failed.ok).toBe(false);
    expect(sendFromManager).not.toHaveBeenCalled();

    const retried = await handleClawLeasingInbound({
      from: "+15105794001",
      text: "retry this",
      messageId: "inbound-log-retry-test",
      workNumber: "+12053690702",
    });
    expect(retried.ok).toBe(true);
    expect(retried.replied).toBe(true);
    expect(sendFromManager).toHaveBeenCalledTimes(1);
  });
});
