/**
 * A CONFIRMED tour must still reach the resident's list.
 *
 * `confirmTourInquiry` CONSUMES the inquiry row: it writes the partner-inquiry
 * payload back without the confirmed id, and the tour lives on only as a row in
 * `axis_admin_planned_events_v1`. `loadResidentTourViews` used to skip any link
 * whose inquiry row was missing, so a resident whose tour was booked was told
 * "Confirmed 0" off a fully SUCCESSFUL read — the same confident zero the rest
 * of this branch is closing, reached by a second path.
 */
import { describe, expect, it } from "vitest";
import { loadResidentTourViews, type ResidentTourLinkRow } from "@/lib/tour-resident-link.server";

const INQUIRIES_RECORD_ID = "axis_admin_partner_inquiries_v1";
const PLANNED_RECORD_ID = "axis_admin_planned_events_v1";

function link(over: Partial<ResidentTourLinkRow> = {}): ResidentTourLinkRow {
  return {
    id: "link-1",
    resident_user_id: "res-1",
    inquiry_id: "inq-1",
    tour_group_id: "grp-1",
    manager_user_id: "mgr-link",
    property_id: "prop-link",
    attendee_email: "guest@example.com",
    linked_at: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

function db(input: {
  links: ResidentTourLinkRow[];
  inquiries: Record<string, unknown>[];
  planned: Record<string, unknown>[];
}) {
  return {
    from: (table: string) => {
      if (table === "resident_tour_links") {
        return {
          select: () => ({
            eq: () => ({ order: async () => ({ data: input.links, error: null }) }),
          }),
        };
      }
      return {
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => ({
              data: {
                row_data: {
                  payload:
                    id === INQUIRIES_RECORD_ID
                      ? input.inquiries
                      : id === PLANNED_RECORD_ID
                        ? input.planned
                        : [],
                },
              },
              error: null,
            }),
          }),
        }),
      };
    },
  } as never;
}

const PLANNED_TOUR = {
  id: "planned-1",
  kind: "tour",
  sourceInquiryId: "inq-1",
  tourGroupId: "grp-1",
  managerUserId: "mgr-1",
  adminLabel: "Dana Manager",
  propertyId: "prop-1",
  propertyTitle: "Ballard House",
  roomLabel: "Room B",
  attendeeName: "Audit Prospect",
  attendeeEmail: "guest@example.com",
  attendeePhone: "+12065550147",
  notes: "Parking on the street",
  instructions: "Buzz unit 3",
  start: "2026-08-06T17:00:00.000Z",
  end: "2026-08-06T17:30:00.000Z",
};

describe("loadResidentTourViews when the inquiry row is gone", () => {
  it("returns the confirmed tour instead of dropping the link", async () => {
    const views = await loadResidentTourViews(
      db({ links: [link()], inquiries: [], planned: [PLANNED_TOUR] }),
      "res-1",
    );

    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      inquiryId: "inq-1",
      status: "confirmed",
      confirmed: true,
      confirmedStart: PLANNED_TOUR.start,
      confirmedEnd: PLANNED_TOUR.end,
      propertyId: "prop-1",
      propertyTitle: "Ballard House",
      roomLabel: "Room B",
      managerUserId: "mgr-1",
      managerLabel: "Dana Manager",
      guestName: "Audit Prospect",
      guestEmail: "guest@example.com",
      guestPhone: "+12065550147",
      notes: "Parking on the street",
      instructions: "Buzz unit 3",
    });
  });

  it("matches a planned tour by tour group when the event carries no inquiry id", async () => {
    const { sourceInquiryId: _dropped, ...byGroup } = PLANNED_TOUR;
    const views = await loadResidentTourViews(
      db({ links: [link()], inquiries: [], planned: [byGroup] }),
      "res-1",
    );
    expect(views).toHaveLength(1);
    expect(views[0]!.confirmed).toBe(true);
  });

  it("falls back to the link's own columns for anything the event lacks", async () => {
    const bare = { id: "planned-1", kind: "tour", sourceInquiryId: "inq-1", start: "", end: "" };
    const views = await loadResidentTourViews(
      db({ links: [link()], inquiries: [], planned: [bare] }),
      "res-1",
    );
    expect(views[0]).toMatchObject({
      propertyId: "prop-link",
      managerUserId: "mgr-link",
      guestEmail: "guest@example.com",
      tourGroupId: "grp-1",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
  });

  it("renders a co-hosted booking once, not once per host", async () => {
    // A slot with several hosts books one inquiry — and so one link — PER
    // MANAGER under a shared tourGroupId, while confirming collapses the whole
    // group into a SINGLE planned event. Without deduping, one tour reads as
    // "Confirmed 2".
    const views = await loadResidentTourViews(
      db({
        links: [link({ id: "link-1", inquiry_id: "inq-1" }), link({ id: "link-2", inquiry_id: "inq-2" })],
        inquiries: [],
        planned: [PLANNED_TOUR],
      }),
      "res-1",
    );
    expect(views).toHaveLength(1);
  });

  it("still skips a link with NEITHER an inquiry nor a planned tour", async () => {
    const views = await loadResidentTourViews(
      db({ links: [link()], inquiries: [], planned: [] }),
      "res-1",
    );
    expect(views).toEqual([]);
  });

  it("leaves the ordinary pending path unchanged when the inquiry survives", async () => {
    const views = await loadResidentTourViews(
      db({
        links: [link()],
        inquiries: [
          {
            id: "inq-1",
            kind: "tour",
            status: "pending",
            email: "guest@example.com",
            propertyTitle: "Ballard House",
            requestedWindows: [{ start: PLANNED_TOUR.start, end: PLANNED_TOUR.end }],
          },
        ],
        planned: [],
      }),
      "res-1",
    );
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ status: "pending", confirmed: false });
  });
});
