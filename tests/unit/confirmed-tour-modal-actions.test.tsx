// @vitest-environment jsdom
/**
 * A confirmed tour is not a one-way door, and its destructive actions are not
 * one click.
 *
 * The audit found the detail modal for a confirmed tour offered exactly two
 * controls:
 *
 *     [...panel.querySelectorAll("button,a")].map(e => e.textContent.trim())
 *     // → ["Close", "Delete event"]
 *
 * No reschedule, no cancel-with-notice. And `Delete event` fired with no
 * confirmation dialog, removed the tour instantly, and sent the guest nothing —
 * after PropLane had already emailed them "Your PropLane tour is confirmed".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortalCalendarPanels, type DemoMeeting } from "@/components/portal/portal-calendar-panels";

/** Painted availability the calendar reads for the storage key under test. */
let PAINTED_SLOTS = new Set<string>();

const cancelFromServer = vi.fn(async () => ({ ok: true }));
const rescheduleFromServer = vi.fn(async () => ({ ok: true }));
const deletePlannedEvent = vi.fn(async () => true);

vi.mock("@/components/providers/app-ui-provider", () => ({
  useAppUi: () => ({ showToast: vi.fn() }),
}));
vi.mock("@/lib/tour-planned-change.client", () => ({
  cancelPlannedTourFromServer: (...args: unknown[]) => cancelFromServer(...(args as [])),
  reschedulePlannedTourFromServer: (...args: unknown[]) => rescheduleFromServer(...(args as [])),
}));
vi.mock("@/lib/google-calendar/delete-tour.client", () => ({
  deleteProplaneGoogleTourFromServer: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/rental-application/data", () => ({ getPropertyById: () => undefined }));
vi.mock("@/lib/manager-calendar-tour-meetings", () => ({
  buildScheduledTourMeetings: () => [],
}));

vi.mock("@/lib/demo-admin-scheduling", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    syncScheduleRecordsFromServer: vi.fn(async () => undefined),
    readAvailabilityDateSetForStorageKey: () => PAINTED_SLOTS,
    readPlannedEvents: () => [],
    deletePlannedEventFromServer: (...args: unknown[]) => deletePlannedEvent(...(args as [])),
    deletePartnerInquiryFromServer: vi.fn(async () => true),
    acceptPartnerInquiryFromServer: vi.fn(async () => ({ ok: true })),
    writeAvailabilityDateSetForStorageKeyToServer: vi.fn(async () => true),
  };
});

/** A confirmed tour on today's calendar, injected as a caller-owned meeting. */
function confirmedTour(): DemoMeeting {
  const start = new Date();
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    id: "planned-1",
    source: "planned",
    sourceId: "planned-1",
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    dateStr: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    startSlot: 20,
    span: 1,
    durationMinutes: 30,
    title: "Tour · Audit Prospect",
    color: "emerald",
    kind: "tour",
    name: "Audit Prospect",
    email: "prospect@example.com",
    propertyTitle: "Ballard House",
  };
}

function renderCalendar(props: { onMeetingsChanged?: () => void } = {}) {
  return render(
    <PortalCalendarPanels
      storageKey="axis_mgr_avail_slots_v2_test"
      externalMeetings={[confirmedTour()]}
      scheduleOwnerLabel="Test Manager"
      {...props}
    />,
  );
}

/** Open the detail modal by clicking the tour's grid cell. */
async function openTourModal() {
  const cell = await waitFor(() => {
    const hit = [...document.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("Audit Prospect"),
    );
    if (!hit) throw new Error("tour cell not rendered");
    return hit;
  });
  fireEvent.click(cell);
  await waitFor(() => {
    if (!document.querySelector(".modal-panel")) throw new Error("modal not open");
  });
}

function modalButtonLabels(): string[] {
  const panel = document.querySelector(".modal-panel");
  return [...(panel?.querySelectorAll("button,a") ?? [])]
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean);
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  PAINTED_SLOTS = new Set<string>();
});

describe("the detail modal for a CONFIRMED tour", () => {
  it("offers reschedule and cancel, not just delete", async () => {
    renderCalendar();
    await openTourModal();

    const labels = modalButtonLabels();
    expect(labels.some((label) => /Reschedule/i.test(label))).toBe(true);
    expect(labels.some((label) => /Cancel tour/i.test(label))).toBe(true);
    // The shape the audit found: delete as the only action.
    expect(labels.filter((label) => /Delete|Cancel tour|Reschedule/i.test(label)).length).toBeGreaterThan(1);
  });

  it("does not delete on the first click — it asks first", async () => {
    renderCalendar();
    await openTourModal();

    fireEvent.click(document.querySelector('[data-attr="tour-delete-open"]')!);

    expect(deletePlannedEvent).not.toHaveBeenCalled();
    expect(document.querySelector('[data-attr="tour-delete-confirm"]')).not.toBeNull();
    // And it says plainly that the guest was already told the tour is on.
    expect(document.querySelector('[data-attr="tour-delete-confirm"]')!.textContent).toContain(
      "already told this tour is confirmed",
    );
  });

  it("lets the manager back out of a delete", async () => {
    renderCalendar();
    await openTourModal();

    fireEvent.click(document.querySelector('[data-attr="tour-delete-open"]')!);
    fireEvent.click([...document.querySelectorAll("button")].find((el) => el.textContent === "Keep tour")!);

    expect(deletePlannedEvent).not.toHaveBeenCalled();
    expect(document.querySelector('[data-attr="tour-delete-confirm"]')).toBeNull();
  });

  it("deletes only after the confirmation step", async () => {
    renderCalendar();
    await openTourModal();

    fireEvent.click(document.querySelector('[data-attr="tour-delete-open"]')!);
    fireEvent.click(document.querySelector('[data-attr="tour-delete-submit"]')!);

    await waitFor(() => expect(deletePlannedEvent).toHaveBeenCalledWith("planned-1"));
  });

  it("cancels through the notifying server route, not a silent local delete", async () => {
    renderCalendar();
    await openTourModal();

    fireEvent.click(document.querySelector('[data-attr="tour-cancel-open"]')!);
    // The confirm step names the guest who was already emailed.
    expect(document.querySelector('[data-attr="tour-cancel-confirm"]')!.textContent).toContain(
      "prospect@example.com",
    );
    fireEvent.click(document.querySelector('[data-attr="tour-cancel-submit"]')!);

    await waitFor(() =>
      expect(cancelFromServer).toHaveBeenCalledWith(expect.objectContaining({ plannedEventId: "planned-1" })),
    );
    expect(deletePlannedEvent).not.toHaveBeenCalled();
  });

  it("reschedules through the notifying server route", async () => {
    renderCalendar();
    await openTourModal();

    fireEvent.click(document.querySelector('[data-attr="tour-reschedule-open"]')!);
    const dateInput = document.querySelector('[data-attr="tour-reschedule-date"]') as HTMLInputElement;
    const timeInput = document.querySelector('[data-attr="tour-reschedule-time"]') as HTMLInputElement;
    expect(dateInput.value).not.toBe("");
    expect(timeInput.value).toBe("10:00"); // seeded from the tour's current time

    fireEvent.change(timeInput, { target: { value: "14:30" } });
    fireEvent.click(document.querySelector('[data-attr="tour-reschedule-save"]')!);

    await waitFor(() => expect(rescheduleFromServer).toHaveBeenCalledTimes(1));
    const call = rescheduleFromServer.mock.calls[0]![0] as { plannedEventId: string; start: string };
    expect(call.plannedEventId).toBe("planned-1");
    expect(new Date(call.start).getHours()).toBe(14);
  });
});

describe("counts stay honest after a tour changes state", () => {
  /** The week's "N open slots" badge — painted availability minus what is booked. */
  function weekOpenSlotCount(): number | null {
    const badge = [...document.querySelectorAll("*")].find(
      (el) => el.children.length === 0 && /^\d+ open slots?$/.test((el.textContent ?? "").trim()),
    );
    const match = /(\d+) open/.exec(badge?.textContent ?? "");
    return match ? Number(match[1]) : null;
  }

  it("does not count a slot a confirmed tour already occupies as open", async () => {
    const tour = confirmedTour();
    // Two painted windows on the tour's day; the tour consumes one of them.
    PAINTED_SLOTS = new Set([`${tour.dateStr}:20`, `${tour.dateStr}:22`]);

    renderCalendar();
    await waitFor(() => expect(weekOpenSlotCount()).not.toBeNull());

    // Before the fix this read 2: the booked 10 am window still advertised
    // itself as open, so the calendar over-reported remaining capacity while
    // the public grid had already (correctly) stopped offering that half hour.
    expect(weekOpenSlotCount()).toBe(1);
  });

  it("tells the page around it whenever a tour changes, so tab counts refresh", async () => {
    // Deleting a confirmed tour redrew the grid while the header's view tabs
    // still read "All 1 / Tours 1" until a manual reload.
    const onMeetingsChanged = vi.fn();
    renderCalendar({ onMeetingsChanged });
    await openTourModal();

    fireEvent.click(document.querySelector('[data-attr="tour-delete-open"]')!);
    fireEvent.click(document.querySelector('[data-attr="tour-delete-submit"]')!);

    await waitFor(() => expect(onMeetingsChanged).toHaveBeenCalled());
  });
});
