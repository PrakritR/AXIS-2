/**
 * The public booking grid's one rule:
 *
 *     offered = (published availability, or the 9-5 default when none is
 *                published) MINUS calendar-busy MINUS already-booked
 *
 * The subtraction half is what stops the same half hour being sold to three
 * prospects. A confirmed tour left its own slot on offer, and the manager's
 * linked-calendar busy time was never read at all even though the product's own
 * copy promises "only the blocked time is shown here so tour availability stays
 * accurate". The default half is intended product behaviour: a property whose
 * manager has not opened a calendar still offers a 9-5 day.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fresh manager id per test. The route caches Google busy windows per manager
 * for 60s so a public, uncached endpoint cannot be used to drive unbounded
 * Google API calls; a shared id would serve one test's busy list to the next.
 */
let MANAGER = "mgr-1";
let managerCounter = 0;
const PROPERTY_ID = "mgr-demo-ballard";

let PROPERTY_AVAILABILITY_SLOTS: string[] | null;
let GLOBAL_AVAILABILITY_SLOTS: string[] | null;
let PENDING_INQUIRIES: Record<string, unknown>[];
let PLANNED_EVENTS: Record<string, unknown>[];
let GOOGLE_BUSY: {
  id: string;
  summary: string;
  start: string;
  end: string;
  transparency?: "opaque" | "transparent";
  declinedBySelf?: boolean;
  allDay?: boolean;
}[];
let GOOGLE_THROWS: boolean;

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: () => makeServiceClient(),
}));
/** The `timeMax` the route asked Google for, per call. */
let GOOGLE_TIME_MAX: string[] = [];

vi.mock("@/lib/google-calendar/api.server", () => ({
  GOOGLE_CALENDAR_EVENT_LIST_BUDGET_MS: 12_000,
  GOOGLE_CALENDAR_FETCH_TIMEOUT_MS: 6_000,
  listGoogleCalendarEvents: vi.fn(async (_db: unknown, _id: string, _min: string, max: string) => {
    GOOGLE_TIME_MAX.push(max);
    if (GOOGLE_THROWS) throw new Error("Google Calendar is not connected.");
    return GOOGLE_BUSY;
  }),
}));
vi.mock("@/lib/public-host-label", () => ({
  publicSchedulingHostLabel: () => "Test Manager",
}));

import { GET as getAvailability } from "@/app/api/public/property-tour-availability/route";
import { DEFAULT_TOUR_HORIZON_DAYS } from "@/lib/tour-slot-math";

function availabilityRow(recordType: string, slots: string[]) {
  return {
    id: `${recordType}_${MANAGER}_prop_${PROPERTY_ID}`,
    manager_user_id: MANAGER,
    property_id: recordType === "manager_property_availability" ? PROPERTY_ID : null,
    record_type: recordType,
    row_data: { payload: slots },
  };
}

function makeServiceClient() {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({ in: async () => ({ data: [{ id: MANAGER, email: "m@x.com", full_name: "Test" }] }) }),
        };
      }
      if (table === "manager_property_records") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  manager_user_id: MANAGER,
                  status: "live",
                  property_data: { id: PROPERTY_ID, buildingName: "Ballard House", address: "1 Ballard Ave" },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "portal_schedule_records") {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: (column: string, value: string) => {
            if (column === "record_type" && value === "manager_property_availability") {
              builder.then = (resolve: (v: unknown) => unknown) =>
                Promise.resolve({
                  data: PROPERTY_AVAILABILITY_SLOTS
                    ? [availabilityRow("manager_property_availability", PROPERTY_AVAILABILITY_SLOTS)]
                    : [],
                  error: null,
                }).then(resolve);
            }
            if (column === "record_type" && value === "manager_availability") {
              builder.in = async () => ({
                data: GLOBAL_AVAILABILITY_SLOTS
                  ? [availabilityRow("manager_availability", GLOBAL_AVAILABILITY_SLOTS)]
                  : [],
                error: null,
              });
            }
            if (column === "record_type" && value === "partner_inquiry_request") {
              builder.in = async () => ({
                data: PENDING_INQUIRIES.map((payload) => ({
                  manager_user_id: MANAGER,
                  row_data: { payload },
                })),
                error: null,
              });
            }
            if (column === "id" && value === "axis_admin_planned_events_v1") {
              builder.maybeSingle = async () => ({
                data: { row_data: { payload: PLANNED_EVENTS } },
                error: null,
              });
            }
            return builder;
          },
          in: async () => ({ data: [], error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return builder;
      }
      return {};
    },
  };
}

async function offeredSlots(): Promise<Set<string>> {
  const res = await getAvailability(
    new Request(`https://x.test/api/public/property-tour-availability?propertyId=${PROPERTY_ID}`),
  );
  const body = (await res.json()) as { slotHosts?: Record<string, unknown[]> };
  return new Set(Object.keys(body.slotHosts ?? {}));
}

/** A far-future date so `slotIsBookable` never filters the fixture out. */
const DAY = "2099-08-06";
/** 10:00-10:30 am Pacific on {@link DAY}. */
const TEN_AM = `${DAY}:20`;
const TEN_AM_START = "2099-08-06T17:00:00.000Z";
const TEN_AM_END = "2099-08-06T17:30:00.000Z";

describe("public tour availability subtracts what is already taken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    managerCounter += 1;
    MANAGER = `mgr-${managerCounter}`;
    PROPERTY_AVAILABILITY_SLOTS = [`${DAY}:18`, `${DAY}:19`, TEN_AM, `${DAY}:21`];
    GLOBAL_AVAILABILITY_SLOTS = null;
    PENDING_INQUIRIES = [];
    PLANNED_EVENTS = [];
    GOOGLE_BUSY = [];
    GOOGLE_THROWS = false;
    GOOGLE_TIME_MAX = [];
  });

  it("offers published availability when nothing is taken", async () => {
    const slots = await offeredSlots();
    expect(slots.has(TEN_AM)).toBe(true);
    expect(slots.size).toBe(4);
  });

  it("removes a confirmed tour's own slot", async () => {
    PLANNED_EVENTS = [
      {
        id: "planned-1",
        kind: "tour",
        managerUserId: MANAGER,
        start: TEN_AM_START,
        end: TEN_AM_END,
        slotKey: TEN_AM,
      },
    ];
    const slots = await offeredSlots();
    expect(slots.has(TEN_AM)).toBe(false);
    expect(slots.has(`${DAY}:21`)).toBe(true);
  });

  it("removes a confirmed tour's slot even when the event carries no slotKey", async () => {
    // A tour confirmed with a custom duration, or moved by a reschedule, has no
    // slotKey to match on — only the time-range overlap can catch it.
    PLANNED_EVENTS = [
      { id: "planned-2", kind: "tour", managerUserId: MANAGER, start: TEN_AM_START, end: TEN_AM_END },
    ];
    const slots = await offeredSlots();
    expect(slots.has(TEN_AM)).toBe(false);
  });

  it("removes every half hour a longer confirmed tour spans", async () => {
    PLANNED_EVENTS = [
      {
        id: "planned-3",
        kind: "tour",
        managerUserId: MANAGER,
        start: TEN_AM_START,
        end: "2099-08-06T18:30:00.000Z", // a 90-minute tour
      },
    ];
    const slots = await offeredSlots();
    expect(slots.has(TEN_AM)).toBe(false);
    expect(slots.has(`${DAY}:21`)).toBe(false);
  });

  it("removes calendar-busy time from the manager's linked calendar", async () => {
    GOOGLE_BUSY = [
      { id: "g1", summary: "Busy", start: "2099-08-06T14:30:00.000Z", end: "2099-08-06T17:00:00.000Z" },
    ];
    const slots = await offeredSlots();
    expect(slots.has(`${DAY}:18`)).toBe(false); // 9:00 am, inside busy
    expect(slots.has(`${DAY}:19`)).toBe(false); // 9:30 am, inside busy
    expect(slots.has(TEN_AM)).toBe(true); // 10:00 am, busy has ended
  });

  it("ignores an event the manager marked Free", async () => {
    // `transparency: "transparent"` is Google's "show me as available". Treating
    // it as busy deletes tour slots the manager never blocked.
    GOOGLE_BUSY = [
      {
        id: "g-free",
        summary: "Focus time",
        start: "2099-08-06T14:30:00.000Z",
        end: "2099-08-06T18:00:00.000Z",
        transparency: "transparent",
      },
    ];
    const slots = await offeredSlots();
    expect(slots.size).toBe(4);
  });

  it("ignores an invite the manager declined", async () => {
    GOOGLE_BUSY = [
      {
        id: "g-declined",
        summary: "Someone else's meeting",
        start: "2099-08-06T14:30:00.000Z",
        end: "2099-08-06T18:00:00.000Z",
        declinedBySelf: true,
      },
    ];
    const slots = await offeredSlots();
    expect(slots.size).toBe(4);
  });

  it("still blocks an all-day entry — a trip is exactly when a manager cannot host", async () => {
    GOOGLE_BUSY = [
      { id: "g-allday", summary: "Out of town", start: `${DAY}T00:00:00`, end: `${DAY}T23:59:59`, allDay: true },
    ];
    const slots = await offeredSlots();
    expect(slots.size).toBe(0);
  });

  it("blocks an all-day entry even though Google reports it Free", async () => {
    // Google Calendar DEFAULTS all-day events to Free, so honouring transparency
    // ahead of the all-day flag would quietly un-block every trip and holiday.
    GOOGLE_BUSY = [
      {
        id: "g-allday-free",
        summary: "Out of town",
        start: `${DAY}T00:00:00`,
        end: `${DAY}T23:59:59`,
        allDay: true,
        transparency: "transparent",
      },
    ];
    const slots = await offeredSlots();
    expect(slots.size).toBe(0);
  });

  it("does not block an all-day invite the manager declined", async () => {
    GOOGLE_BUSY = [
      {
        id: "g-allday-declined",
        summary: "Someone else's offsite",
        start: `${DAY}T00:00:00`,
        end: `${DAY}T23:59:59`,
        allDay: true,
        declinedBySelf: true,
      },
    ];
    const slots = await offeredSlots();
    expect(slots.size).toBe(4);
  });

  it("reads busy time across the ENTIRE range it can offer, not the default horizon", async () => {
    // The published fixture sits far past `DEFAULT_TOUR_HORIZON_DAYS`. Bounding
    // the busy read by that constant left a manager's Google-busy morning
    // bookable again past day 21 — the same double-booking defect, moved later.
    await offeredSlots();
    const furthestOffered = Date.parse(TEN_AM_END);
    expect(GOOGLE_TIME_MAX).toHaveLength(1);
    expect(Date.parse(GOOGLE_TIME_MAX[0]!)).toBeGreaterThanOrEqual(furthestOffered);
  });

  it("subtracts busy time from a published slot well past the default horizon", async () => {
    GOOGLE_BUSY = [
      { id: "g-far", summary: "Busy", start: TEN_AM_START, end: TEN_AM_END },
    ];
    const slots = await offeredSlots();
    expect(slots.has(TEN_AM)).toBe(false);
  });

  it("still serves availability when the calendar link is broken", async () => {
    GOOGLE_THROWS = true;
    const slots = await offeredSlots();
    expect(slots.size).toBe(4);
  });

  it("removes a slot a pending request already holds", async () => {
    PENDING_INQUIRIES = [
      {
        id: "inq-1",
        kind: "tour",
        status: "pending",
        proposedStart: TEN_AM_START,
        proposedEnd: TEN_AM_END,
        slotKey: TEN_AM,
      },
    ];
    const slots = await offeredSlots();
    expect(slots.has(TEN_AM)).toBe(false);
  });

  it("is never edge-cached — a booked slot must not linger at the CDN", async () => {
    const res = await getAvailability(
      new Request(`https://x.test/api/public/property-tour-availability?propertyId=${PROPERTY_ID}`),
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("a property with no published availability still offers the 9-5 default", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    managerCounter += 1;
    MANAGER = `mgr-${managerCounter}`;
    PROPERTY_AVAILABILITY_SLOTS = null;
    GLOBAL_AVAILABILITY_SLOTS = null;
    PENDING_INQUIRIES = [];
    PLANNED_EVENTS = [];
    GOOGLE_BUSY = [];
    GOOGLE_THROWS = false;
    GOOGLE_TIME_MAX = [];
  });

  it("bounds the default grid to the 21-day horizon", async () => {
    // The response is `no-store`, so every request pays for the whole grid.
    const slots = await offeredSlots();
    const days = new Set([...slots].map((slot) => slot.split(":")[0]));
    expect(days.size).toBeLessThanOrEqual(DEFAULT_TOUR_HORIZON_DAYS);
    expect(days.size).toBeGreaterThanOrEqual(DEFAULT_TOUR_HORIZON_DAYS - 1);
  });

  it("offers a 9 am - 5 pm day rather than nothing", async () => {
    const slots = await offeredSlots();
    expect(slots.size).toBeGreaterThan(0);
    const slotIndices = new Set([...slots].map((slot) => Number(slot.split(":")[1])));
    expect(Math.min(...slotIndices)).toBe(18); // 9:00 am
    expect(Math.max(...slotIndices)).toBe(33); // 4:30 pm, ending at 5:00 pm
  });

  it("subtracts calendar-busy time from the DEFAULT grid too", async () => {
    // The default is a starting point, not a promise of open time.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const day = `${tomorrow.getUTCFullYear()}-${pad(tomorrow.getUTCMonth() + 1)}-${pad(tomorrow.getUTCDate())}`;
    GOOGLE_BUSY = [
      { id: "g1", summary: "Busy all day", start: `${day}T00:00:00`, end: `${day}T23:59:59` },
    ];
    const slots = await offeredSlots();
    expect([...slots].some((slot) => slot.startsWith(`${day}:`))).toBe(false);
  });

  it("subtracts an already-booked tour from the DEFAULT grid too", async () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const day = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
    const slotKey = `${day}:20`;
    PLANNED_EVENTS = [
      {
        id: "planned-default",
        kind: "tour",
        managerUserId: MANAGER,
        start: new Date(new Date(`${day}T10:00:00`).getTime()).toISOString(),
        end: new Date(new Date(`${day}T10:30:00`).getTime()).toISOString(),
        slotKey,
      },
    ];
    const slots = await offeredSlots();
    expect(slots.has(slotKey)).toBe(false);
    expect(slots.has(`${day}:22`)).toBe(true);
  });
});
