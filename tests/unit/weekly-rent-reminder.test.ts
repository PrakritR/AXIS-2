import { describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "./support/memory-supabase";

const { sendFromWorkNumberMock, resolveSendNumberMock } = vi.hoisted(() => ({
  sendFromWorkNumberMock: vi.fn(async () => ({ ok: true as const })),
  resolveSendNumberMock: vi.fn(async () => "+12065559000" as string | null),
}));

vi.mock("@/lib/proplane-sms-transport.server", () => ({
  sendFromManagerWorkNumber: sendFromWorkNumberMock,
}));
vi.mock("@/lib/sms/manager-number-provisioning.server", () => ({
  resolveActiveManagerSendNumber: resolveSendNumberMock,
}));

import { isoWeekKey, sendWeeklyRentReminders, weeklyRentReminderDedupId } from "@/lib/sms/weekly-rent-reminder.server";

function seed() {
  return createMemoryDb({
    portal_household_charge_records: [
      {
        manager_user_id: "mgrA",
        status: "pending",
        row_data: {
          id: "hc1",
          kind: "rent",
          residentEmail: "res@example.com",
          residentName: "Res One",
          residentUserId: "resA",
          managerUserId: "mgrA",
          propertyLabel: "12 Oak St #3",
          amountLabel: "$1,800",
          dueDateLabel: "Aug 1",
        },
      },
    ],
    profiles: [{ id: "resA", phone: "+12065552222", phone_verified_at: "2026-01-01T00:00:00Z", email: "res@example.com" }],
    portal_outbound_mail_records: [],
  });
}

describe("isoWeekKey", () => {
  it("is stable within a Mon–Sun week and rolls over", () => {
    expect(isoWeekKey(new Date("2026-07-20T12:00:00Z"))).toBe(isoWeekKey(new Date("2026-07-24T12:00:00Z")));
    expect(isoWeekKey(new Date("2026-07-20T00:00:00Z"))).not.toBe(isoWeekKey(new Date("2026-07-27T00:00:00Z")));
  });
});

describe("sendWeeklyRentReminders — idempotent per week", () => {
  it("sends once, then a duplicate run (retry / redeploy / duplicate tick) does not text again", async () => {
    sendFromWorkNumberMock.mockClear();
    resolveSendNumberMock.mockResolvedValue("+12065559000");
    const db = seed() as never;
    const now = new Date("2026-07-22T18:00:00Z");

    const first = await sendWeeklyRentReminders(db, { now });
    expect(first.sent).toBe(1);
    expect(sendFromWorkNumberMock).toHaveBeenCalledTimes(1);
    // Sent as automated so consent + quiet-hours gating applies downstream.
    expect(sendFromWorkNumberMock).toHaveBeenCalledWith(expect.objectContaining({ sendClass: "automated", to: "+12065552222" }));

    const second = await sendWeeklyRentReminders(db, { now });
    expect(second.sent).toBe(0);
    expect(second.skippedAlreadySent).toBe(1);
    expect(sendFromWorkNumberMock).toHaveBeenCalledTimes(1); // still one — never texted twice

    // A different week is a fresh reminder.
    const nextWeek = await sendWeeklyRentReminders(db, { now: new Date("2026-07-29T18:00:00Z") });
    expect(nextWeek.sent).toBe(1);
    expect(sendFromWorkNumberMock).toHaveBeenCalledTimes(2);
  });

  it("skips managers whose registration is not approved (null send number)", async () => {
    sendFromWorkNumberMock.mockClear();
    resolveSendNumberMock.mockResolvedValue(null);
    const db = seed() as never;
    const res = await sendWeeklyRentReminders(db, { now: new Date("2026-07-22T18:00:00Z") });
    expect(res.sent).toBe(0);
    expect(res.skippedNoSendNumber).toBe(1);
    expect(sendFromWorkNumberMock).not.toHaveBeenCalled();
  });

  it("dedup id keys on week + manager + resident (one reminder per manager per resident per week)", () => {
    expect(weeklyRentReminderDedupId("2026-W30", "mgrA", "u_resA")).toBe("weekly_rent_sms_2026-W30_mgrA_u_resA");
    // Same resident under a different manager is a DISTINCT key.
    expect(weeklyRentReminderDedupId("2026-W30", "mgrB", "u_resA")).not.toBe(
      weeklyRentReminderDedupId("2026-W30", "mgrA", "u_resA"),
    );
  });
});
