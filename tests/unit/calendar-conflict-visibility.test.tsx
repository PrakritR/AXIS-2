// @vitest-environment jsdom
//
// Two manager-calendar findings that both come down to "the screen you act on
// disagrees with the screen beside it":
//
//  F-CAL-1 — the day headers read "9 EVENTS" while the view tabs immediately
//  above read "All 0", because the headers counted linked-Google busy blocks
//  and the tabs counted tours + service orders.
//
//  F-CAL-6 — the PER-PROPERTY availability calendar, the screen where a manager
//  publishes tour windows, rendered no busy overlay at all, so a half hour the
//  portfolio calendar showed as "Blocked" was a free, selectable slot there.
//  Publishing on top of it is a double-booking.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { DemoMeeting } from "@/components/portal/portal-calendar-panels";
import { scheduledCalendarMeetings } from "@/lib/google-calendar/meetings";

const capturedProps: Record<string, unknown>[] = [];

vi.mock("@/components/portal/portal-calendar-panels", () => ({
  PortalCalendarPanels: (props: Record<string, unknown>) => {
    capturedProps.push(props);
    return null;
  },
}));
vi.mock("@/components/portal/portal-property-detail-section", () => ({
  PortalPropertyDetailSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/portal/share-lead-link-modal", () => ({
  ShareLeadLinkModal: () => null,
}));

function meeting(over: Partial<DemoMeeting>): DemoMeeting {
  return {
    id: "m1",
    dateStr: "2026-08-03",
    startSlot: 15,
    endSlot: 16,
    title: "Busy",
    source: "external",
    sourceId: "g1",
    startIso: "2026-08-03T07:30:00.000Z",
    ...over,
  } as DemoMeeting;
}

afterEach(() => {
  capturedProps.length = 0;
  cleanup();
  vi.unstubAllGlobals();
});

describe("day-header event counts (F-CAL-1)", () => {
  it("counts what the view tabs count — tours and service visits, not Google busy", () => {
    const meetings = [
      meeting({ id: "busy-1", googleCalendarPrivate: true }),
      meeting({ id: "busy-2", googleCalendarPrivate: true }),
      meeting({ id: "tour-1", source: "planned", kind: "tour", googleCalendarPrivate: false }),
    ];
    expect(scheduledCalendarMeetings(meetings).map((m) => m.id)).toEqual(["tour-1"]);
  });

  it("a week of nothing but busy blocks counts zero events, matching 'All 0'", () => {
    const busyWeek = Array.from({ length: 9 }, (_, i) =>
      meeting({ id: `busy-${i}`, googleCalendarPrivate: true }),
    );
    expect(scheduledCalendarMeetings(busyWeek)).toHaveLength(0);
  });

  it("keeps a Google-sourced TOUR — only personal busy time is excluded", () => {
    const tourFromGoogle = meeting({ id: "g-tour", kind: "tour", googleCalendarPrivate: false });
    expect(scheduledCalendarMeetings([tourFromGoogle])).toHaveLength(1);
  });
});

describe("property availability calendar shows the same conflicts (F-CAL-6)", () => {
  it("passes linked-Google busy time into the per-property calendar", async () => {
    const busy = meeting({ id: "busy-1", googleCalendarPrivate: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ meetings: [busy] }) })),
    );
    const { ManagerPropertyTourPanel } = await import("@/components/portal/manager-property-tour-panel");
    render(
      <ManagerPropertyTourPanel listingId="mgr-demo-ballard" managerUserId="m1" propertyLabel="Ballard House" />,
    );
    await waitFor(() => {
      const latest = capturedProps.at(-1);
      expect((latest?.externalMeetings as DemoMeeting[] | undefined)?.map((m) => m.id)).toEqual(["busy-1"]);
    });
  });

  it("asks for a window wide enough that navigating a few weeks out still shows conflicts", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ meetings: [] }) }));
    vi.stubGlobal("fetch", fetchMock);
    const { GOOGLE_BUSY_DEFAULT_DAYS_AHEAD } = await import("@/hooks/use-google-calendar-busy");
    const { ManagerPropertyTourPanel } = await import("@/components/portal/manager-property-tour-panel");
    render(
      <ManagerPropertyTourPanel listingId="mgr-demo-ballard" managerUserId="m1" propertyLabel="Ballard House" />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = new URL(String(fetchMock.mock.calls[0]![0]), "https://example.test");
    const timeMin = new Date(url.searchParams.get("timeMin")!);
    const timeMax = new Date(url.searchParams.get("timeMax")!);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // Starts before today, so this week is never clipped at "now"…
    expect(timeMin.getTime()).toBeLessThan(now);
    // …and reaches far enough forward that the two-week blind spot is gone.
    expect(GOOGLE_BUSY_DEFAULT_DAYS_AHEAD).toBeGreaterThanOrEqual(56);
    expect((timeMax.getTime() - now) / day).toBeGreaterThan(50);
  });

  it("asks Google for nothing when there is no signed-in manager", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ meetings: [] }) }));
    vi.stubGlobal("fetch", fetchMock);
    const { ManagerPropertyTourPanel } = await import("@/components/portal/manager-property-tour-panel");
    render(
      <ManagerPropertyTourPanel listingId="mgr-demo-ballard" managerUserId={null} propertyLabel="Ballard House" />,
    );
    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(capturedProps.at(-1)?.externalMeetings).toEqual([]);
  });
});
