import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard: a per-manager Twilio work number must recognize ONLY that
 * manager's own verified personal phone as staff. Before this fix,
 * `isManagerPersonalPhone` also accepted ANY registered shared-line manager
 * (`isMappedManagerPhone`) as a shortcut — harmless when the shared-line
 * roster was 2-3 trial accounts, but a real cross-manager isolation gap once
 * registration became DB-driven over every real manager (a different
 * manager's verified phone would be treated as staff on THIS manager's
 * dedicated number).
 */

const sendFromManager = vi.fn(async () => ({ ok: true, channel: "twilio" as const, sid: "SM1" }));
const runManagerAgentCommand = vi.fn(async () => null);
const tryRelayManagerReplyViaClaw = vi.fn(async () => ({ relayed: false }));
const isMappedManagerPhone = vi.fn(async () => true); // simulates: this phone IS registered as SOME manager on the shared line

vi.mock("@/lib/proplane-sms-transport.server", () => ({
  sendPropLaneSms: vi.fn(async () => ({ ok: true })),
  sendFromManagerWorkNumber: (...args: unknown[]) => sendFromManager(...(args as [unknown])),
}));

vi.mock("@/lib/claw-manager-actions.server", () => ({
  runManagerAgentCommand: (...args: unknown[]) => runManagerAgentCommand(...(args as [unknown])),
}));

vi.mock("@/lib/claw-relay.server", () => ({
  forwardClawInboundToManagers: vi.fn(async () => ({ forwardedTo: [] })),
  isMappedManagerPhone: (...args: unknown[]) => isMappedManagerPhone(...(args as [unknown])),
  tryRelayManagerReplyViaClaw: (...args: unknown[]) => tryRelayManagerReplyViaClaw(...(args as [unknown])),
}));

vi.mock("@/lib/claw-resident-messaging.server", () => ({
  clawMappedManagerEmails: () => [],
  resolveMappedManagerContacts: vi.fn(async () => []),
  resolveRegisteredClawManagers: vi.fn(async () => []),
  findResidentProfileByPhone: vi.fn(async () => null),
  findThreadByResidentPhone: vi.fn(async () => null),
  forwardResidentMessageToManagers: vi.fn(async () => ({ forwardedTo: [] })),
  mirrorResidentTextToManagerInbox: vi.fn(async () => undefined),
  openClawResidentThread: vi.fn(async () => null),
}));

vi.mock("@/lib/agent/leasing-sms-agent.server", () => ({
  runLeasingSmsAgentTurn: vi.fn(async () => null),
  deliverLeasingSmsReply: vi.fn(async () => ({ ok: false })),
}));

vi.mock("@/lib/supabase/service", () => {
  // Manager A's OWN verified phone — deliberately NOT the inbound "from" below.
  const MANAGER_A_PROFILE = {
    id: "mgr-A",
    email: "mgr-a@real-landlord.com",
    full_name: "Manager A",
    phone: "4255551111",
    phone_verified_at: "2026-01-01T00:00:00Z",
  };

  function chain(table: string) {
    const eqArgs: Array<[string, unknown]> = [];
    const q: Record<string, unknown> = {};
    const ret = () => q;
    q.select = ret;
    q.in = ret;
    q.order = ret;
    q.limit = ret;
    q.eq = (col: string, val: unknown) => {
      eqArgs.push([col, val]);
      return q;
    };
    q.insert = async () => ({ error: null });
    q.maybeSingle = async () => {
      if (table === "profiles" && eqArgs.some(([c, v]) => c === "id" && v === "mgr-A")) {
        return { data: MANAGER_A_PROFILE };
      }
      return { data: null };
    };
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [] }).then(res, rej);
    return q;
  }

  return {
    createSupabaseServiceRoleClient: () => ({ from: (table: string) => chain(table) }),
  };
});

describe("handleClawLeasingInbound — per-manager work number stays scoped", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendFromManager.mockResolvedValue({ ok: true, channel: "twilio", sid: "SM1" });
    runManagerAgentCommand.mockResolvedValue(null);
    tryRelayManagerReplyViaClaw.mockResolvedValue({ relayed: false });
    isMappedManagerPhone.mockResolvedValue(true);
  });

  it("does NOT treat a DIFFERENT registered manager's verified phone as staff on this manager's dedicated number", async () => {
    const { handleClawLeasingInbound } = await import("@/lib/claw-leasing-bot.server");
    const result = await handleClawLeasingInbound({
      // A phone that belongs to some OTHER manager on the shared line
      // (isMappedManagerPhone is stubbed to say "yes, this is a manager
      // somewhere") — but it is NOT mgr-A's own phone (+14255551111).
      from: "+15105559999",
      text: "hey",
      messageId: "scoping-test-1",
      managerUserId: "mgr-A",
      workNumber: "+14258909021",
    });

    expect(result.ok).toBe(true);
    // Must NOT be routed into the manager-command / manager-relay surface.
    expect(runManagerAgentCommand).not.toHaveBeenCalled();
    expect(tryRelayManagerReplyViaClaw).not.toHaveBeenCalled();
    // Instead falls through to the ordinary prospect/leasing auto-reply.
    expect(sendFromManager).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+15105559999", managerUserId: "mgr-A" }),
    );
  });

  it("DOES treat mgr-A's own verified phone as staff on mgr-A's dedicated number", async () => {
    const { handleClawLeasingInbound } = await import("@/lib/claw-leasing-bot.server");
    await handleClawLeasingInbound({
      from: "+14255551111", // mgr-A's own verified phone
      text: "hey",
      messageId: "scoping-test-2",
      managerUserId: "mgr-A",
      workNumber: "+14258909021",
    });

    expect(runManagerAgentCommand).toHaveBeenCalled();
  });
});
