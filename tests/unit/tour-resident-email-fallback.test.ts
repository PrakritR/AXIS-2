import { describe, expect, it } from "vitest";
import {
  isResidentTourLinksSchemaError,
  loadResidentTourViews,
  residentHasTourLinks,
} from "@/lib/tour-resident-link.server";

const INQUIRIES_RECORD_ID = "axis_admin_partner_inquiries_v1";
const PLANNED_RECORD_ID = "axis_admin_planned_events_v1";

function dbWithSchemaGap(inquiries: Record<string, unknown>[]) {
  const linksSchemaError = {
    message: "Could not find the table 'public.resident_tour_links' in the schema cache",
  };
  return {
    from: (table: string) => {
      if (table === "resident_tour_links") {
        return {
          select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return {
                eq: async () => ({ count: 0, error: linksSchemaError }),
              };
            }
            return {
              eq: () => ({
                order: async () => ({ data: null, error: linksSchemaError }),
              }),
            };
          },
        };
      }
      return {
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => ({
              data: {
                row_data: {
                  payload: id === INQUIRIES_RECORD_ID ? inquiries : [],
                },
              },
              error: null,
            }),
          }),
        }),
      };
    },
  };
}

describe("resident tour email fallback", () => {
  it("detects missing resident_tour_links schema errors", () => {
    expect(
      isResidentTourLinksSchemaError("Could not find the table 'public.resident_tour_links' in the schema cache"),
    ).toBe(true);
    expect(isResidentTourLinksSchemaError("connection reset")).toBe(false);
  });

  it("loads pending tours from email-matched inquiries when the links table is absent", async () => {
    const db = dbWithSchemaGap([
      {
        id: "inq-tour-1",
        kind: "tour",
        email: "resident@test.proplane.local",
        status: "pending",
        propertyTitle: "Lakeview Studio",
        proposedStart: "2026-08-10T17:00:00.000Z",
        proposedEnd: "2026-08-10T17:30:00.000Z",
      },
    ]);

    const views = await loadResidentTourViews(db as never, "res-1", {
      email: "resident@test.proplane.local",
    });

    expect(views).toHaveLength(1);
    expect(views[0]?.inquiryId).toBe("inq-tour-1");
    expect(views[0]?.propertyTitle).toBe("Lakeview Studio");
    expect(views[0]?.status).toBe("pending");
  });

  it("reports hasTourLink from email-matched inquiries when the links table is absent", async () => {
    const db = dbWithSchemaGap([
      { id: "inq-tour-1", kind: "tour", email: "resident@test.proplane.local" },
    ]);

    await expect(
      residentHasTourLinks(db as never, "res-1", "resident@test.proplane.local"),
    ).resolves.toBe(true);
  });
});
