import { describe, expect, it } from "vitest";
import {
  workOrderGoogleCalendarSyncChanged,
  workOrderShouldSyncToGoogleCalendar,
} from "@/lib/google-calendar/sync.server";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

function row(overrides: Partial<DemoManagerWorkOrderRow> = {}): DemoManagerWorkOrderRow {
  return {
    id: "wo-1",
    propertyName: "Oak House",
    unit: "2A",
    title: "Leaky faucet",
    priority: "Normal",
    status: "Scheduled",
    bucket: "scheduled",
    description: "Kitchen sink drip",
    scheduled: "Aug 2, 3:00 PM",
    cost: "—",
    scheduledAtIso: "2026-08-02T22:00:00.000Z",
    managerUserId: "mgr-1",
    ...overrides,
  };
}

describe("work order google calendar sync", () => {
  it("syncs scheduled visits and skips completed rows", () => {
    expect(workOrderShouldSyncToGoogleCalendar(row())).toBe(true);
    expect(workOrderShouldSyncToGoogleCalendar(row({ bucket: "completed" }))).toBe(false);
    expect(workOrderShouldSyncToGoogleCalendar(row({ scheduledAtIso: undefined }))).toBe(false);
  });

  it("detects schedule and detail changes", () => {
    const previous = row();
    expect(workOrderGoogleCalendarSyncChanged(previous, row())).toBe(false);
    expect(
      workOrderGoogleCalendarSyncChanged(
        previous,
        row({ scheduledAtIso: "2026-08-02T23:00:00.000Z" }),
      ),
    ).toBe(true);
    expect(workOrderGoogleCalendarSyncChanged(null, row())).toBe(true);
  });
});
