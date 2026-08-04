import { describe, expect, it } from "vitest";
import {
  googleCalendarEventsToMeetings,
  isGoogleCalendarPrivateBlock,
  isGoogleCalendarTourEvent,
  isGoogleCalendarWorkOrderEvent,
  meetingCalendarGridLabel,
  parseProplaneGoogleCalendarDescription,
} from "@/lib/google-calendar/meetings";
import type { GoogleCalendarApiEvent } from "@/lib/google-calendar/api.server";
import { meetingConsumesTourSlot } from "@/components/portal/portal-calendar-panels";
import {
  PROPLANE_GOOGLE_CALENDAR_MARKER,
  PROPLANE_TOUR_TYPE_MARKER,
  PROPLANE_WORK_ORDER_TYPE_MARKER,
} from "@/lib/google-calendar/markers";

function event(overrides: Partial<GoogleCalendarApiEvent> & Pick<GoogleCalendarApiEvent, "summary">): GoogleCalendarApiEvent {
  return {
    id: "evt-1",
    start: "2026-08-02T15:00:00-07:00",
    end: "2026-08-02T15:30:00-07:00",
    ...overrides,
  };
}

describe("google calendar meetings", () => {
  it("classifies PropPlane tour events and shows their title", () => {
    expect(
      isGoogleCalendarTourEvent(
        event({
          summary: "Tour · Alex Kim",
          description: `${PROPLANE_TOUR_TYPE_MARKER}\nGuest: Alex Kim\nEmail: alex@example.com\n${PROPLANE_GOOGLE_CALENDAR_MARKER}`,
        }),
      ),
    ).toBe(true);

    const [meeting] = googleCalendarEventsToMeetings([
      event({
        summary: "Tour · Alex Kim",
        description: `${PROPLANE_TOUR_TYPE_MARKER}\nGuest: Alex Kim\nEmail: alex@example.com\n${PROPLANE_GOOGLE_CALENDAR_MARKER}`,
      }),
    ]);
    expect(meeting?.kind).toBe("tour");
    expect(meeting?.title).toBe("Tour · Alex Kim");
    expect(meeting?.statusLabel).toBe("Confirmed");
    expect(meeting?.name).toBe("Alex Kim");
    expect(isGoogleCalendarPrivateBlock(meeting!)).toBe(false);
    expect(meetingCalendarGridLabel(meeting!)).toContain("Confirmed");
  });

  it("parses PropPlane Google description into guest fields", () => {
    const parsed = parseProplaneGoogleCalendarDescription(
      "Type: tour\nGuest: s\nEmail: s@gmail.com\nPhone: +14330033333\nNotes: Property: Ballard House · 3 rooms\nRoom: Not sure which room yet\nCreated from PropPlane",
    );
    expect(parsed.guestName).toBe("s");
    expect(parsed.email).toBe("s@gmail.com");
    expect(parsed.propertyTitle).toBe("Ballard House · 3 rooms");
    expect(parsed.roomLabel).toBe("Not sure which room yet");
  });

  it("blocks personal Google events without exposing titles", () => {
    const [meeting] = googleCalendarEventsToMeetings([
      event({ summary: "Dentist appointment", description: "Private note" }),
    ]);
    expect(meeting?.title).toBe("Blocked");
    expect(meeting?.googleCalendarPrivate).toBe(true);
    expect(isGoogleCalendarPrivateBlock(meeting!)).toBe(true);
    expect(meetingCalendarGridLabel(meeting!)).toBe("Blocked");
  });

  it("classifies PropPlane work order events", () => {
    expect(
      isGoogleCalendarWorkOrderEvent(
        event({
          summary: "Acme Plumbing · Leaky faucet",
          description: `${PROPLANE_WORK_ORDER_TYPE_MARKER}\n${PROPLANE_GOOGLE_CALENDAR_MARKER}`,
        }),
      ),
    ).toBe(true);

    const [meeting] = googleCalendarEventsToMeetings([
      event({
        summary: "My work · Replace filter",
        description: `${PROPLANE_WORK_ORDER_TYPE_MARKER}\n${PROPLANE_GOOGLE_CALENDAR_MARKER}`,
      }),
    ]);
    expect(meeting?.kind).toBe("service");
    expect(meeting?.title).toBe("My work · Replace filter");
    expect(meeting?.statusLabel).toBe("Scheduled");
    expect(isGoogleCalendarPrivateBlock(meeting!)).toBe(false);
  });
});

/**
 * The manager's "N open" headers count a slot as taken when a meeting occupies
 * it, so what becomes a meeting here has to be exactly what the public booking
 * route subtracts. When only the public side filtered, a declined invite at 2pm
 * vanished from the manager's remaining capacity while the page still sold 2pm.
 */
describe("every Google event still renders; only some count as taken", () => {
  it("still draws an event the manager marked Free, but does not count it", () => {
    const [meeting] = googleCalendarEventsToMeetings([
      event({ summary: "Focus time", transparency: "transparent" }),
    ]);
    expect(meeting).toBeDefined();
    expect(meeting!.blocksTourAvailability).toBe(false);
    expect(meetingConsumesTourSlot(meeting!)).toBe(false);
  });

  it("still draws an invite the manager declined, but does not count it", () => {
    const [meeting] = googleCalendarEventsToMeetings([
      event({ summary: "Someone else's meeting", declinedBySelf: true }),
    ]);
    expect(meeting).toBeDefined();
    expect(meetingConsumesTourSlot(meeting!)).toBe(false);
  });

  it("keeps a PropLane service visit visible even when marked Free", () => {
    // It is PropLane's own pushed event; vanishing from the manager's calendar
    // because someone flipped it to Free would be a visible regression.
    const [meeting] = googleCalendarEventsToMeetings([
      event({
        summary: "My work · Replace filter",
        description: `${PROPLANE_WORK_ORDER_TYPE_MARKER}\n${PROPLANE_GOOGLE_CALENDAR_MARKER}`,
        transparency: "transparent",
      }),
    ]);
    expect(meeting?.kind).toBe("service");
    expect(meetingConsumesTourSlot(meeting!)).toBe(false);
  });

  it("counts an all-day entry even though Google reports it Free", () => {
    const [meeting] = googleCalendarEventsToMeetings([
      event({ summary: "Out of town", transparency: "transparent", allDay: true }),
    ]);
    expect(meetingConsumesTourSlot(meeting!)).toBe(true);
  });

  it("counts an ordinary busy event", () => {
    const [meeting] = googleCalendarEventsToMeetings([event({ summary: "Dentist" })]);
    expect(meetingConsumesTourSlot(meeting!)).toBe(true);
  });
});
