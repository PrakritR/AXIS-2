import { beforeEach, describe, expect, it, vi } from "vitest";

const sendFromManagerWorkNumber = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/claw-messenger.server", () => ({
  clawLeasingAgentPhoneE164: () => "+12053690702",
  normalizeE164Us: (phone: string) => phone,
}));

vi.mock("@/lib/claw-resident-messaging.server", () => ({
  clawMappedManagerEmails: () => [],
  clawManagerForwardPhonesFromEnv: () => ["+15550009999"],
  isMappedManagerPhone: vi.fn(async () => false),
  openClawResidentThread: vi.fn(async () => null),
  resolveMappedManagerContacts: vi.fn(async () => [
    {
      userId: "mgr-1",
      email: "manager@example.com",
      fullName: "Manager",
      personalPhone: "+15550001111",
    },
  ]),
}));

vi.mock("@/lib/proplane-sms-transport.server", () => ({
  sendFromManagerWorkNumber: (...args: unknown[]) =>
    sendFromManagerWorkNumber(...(args as [unknown])),
  sendPropLaneSms: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.maybeSingle = async () => ({ data: null });
      return query;
    },
  }),
}));

describe("forwardClawInboundToManagers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendFromManagerWorkNumber.mockResolvedValue({ ok: true });
  });

  it("does not send a non-trial manager's leasing traffic to ops forward phones", async () => {
    const { forwardClawInboundToManagers } = await import("@/lib/claw-relay.server");
    const result = await forwardClawInboundToManagers({
      fromResident: "+15550002222",
      text: "Can I tour the unit?",
      intentLabel: "tour",
      managerUserId: "mgr-1",
    });

    expect(result.forwardedTo).toEqual(["+15550001111"]);
    expect(sendFromManagerWorkNumber).toHaveBeenCalledTimes(1);
    expect(sendFromManagerWorkNumber).toHaveBeenCalledWith(
      expect.objectContaining({ managerUserId: "mgr-1", to: "+15550001111" }),
    );
  });
});
