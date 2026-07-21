import { beforeEach, describe, expect, it, vi } from "vitest";

const sendPropLaneSms = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/proplane-sms-transport.server", () => ({
  sendPropLaneSms: (...args: unknown[]) => sendPropLaneSms(...(args as [])),
}));

const recipients: Array<{ userId: string; email: string; fullName: string | null; phone: string | null }> = [];
vi.mock("@/lib/co-manager-notification-recipients.server", () => ({
  resolvePropertyLeadRecipientIds: vi.fn(async () => recipients.map((r) => r.userId)),
  resolveManagerRecipientProfiles: vi.fn(async () => recipients),
}));

vi.mock("@/lib/resident-outbound-sms.server", () => ({
  sendResidentOutboundSms: vi.fn(async () => ({ ok: true })),
}));

import { notifyManagerTourRequest } from "@/lib/tour-notification-delivery.server";

function makeDb() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { id: "admin-1", email: "admin@test.axis.local", full_name: "admin" },
          })),
        })),
      })),
      upsert: vi.fn(async () => ({ data: null, error: null })),
    })),
  } as unknown as Parameters<typeof notifyManagerTourRequest>[0];
}

const req = new Request("http://localhost:3100/api/public/tour-inquiries");

const inquiry = {
  name: "Jordan Guest",
  email: "guest@example.com",
  managerUserId: "admin-1",
  propertyTitle: "Maple House",
  proposedStart: "2026-07-22T18:00:00.000Z",
  proposedEnd: "2026-07-22T18:30:00.000Z",
};

describe("notifyManagerTourRequest SMS leg", () => {
  beforeEach(() => {
    sendPropLaneSms.mockClear();
    recipients.length = 0;
  });

  it("texts every recipient with a forward-enabled phone on file", async () => {
    recipients.push(
      { userId: "admin-1", email: "admin@test.axis.local", fullName: "admin", phone: "+15103098345" },
      { userId: "co-1", email: "co@test.axis.local", fullName: null, phone: "+12065551234" },
    );

    const res = await notifyManagerTourRequest(makeDb(), req, inquiry);
    expect(res.ok).toBe(true);

    const targets = sendPropLaneSms.mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(targets).toEqual(["+15103098345", "+12065551234"]);
    for (const call of sendPropLaneSms.mock.calls) {
      const { text } = call[0] as { text: string };
      expect(text).toContain("new tour request");
      expect(text).toContain("Maple House");
      expect(text).toContain("Jordan Guest");
    }
  });

  it("skips recipients without a phone (none on file or sms_forward_inbound opt-out)", async () => {
    recipients.push(
      { userId: "admin-1", email: "admin@test.axis.local", fullName: "admin", phone: "+15103098345" },
      { userId: "co-optout", email: "optout@test.axis.local", fullName: null, phone: null },
    );

    const res = await notifyManagerTourRequest(makeDb(), req, inquiry);
    expect(res.ok).toBe(true);
    expect(sendPropLaneSms).toHaveBeenCalledTimes(1);
    expect((sendPropLaneSms.mock.calls[0]![0] as { to: string }).to).toBe("+15103098345");
  });

  it("still succeeds when no recipient has a phone (email-only path unchanged)", async () => {
    recipients.push({ userId: "admin-1", email: "admin@test.axis.local", fullName: "admin", phone: null });

    const res = await notifyManagerTourRequest(makeDb(), req, inquiry);
    expect(res.ok).toBe(true);
    expect(sendPropLaneSms).not.toHaveBeenCalled();
  });
});
