// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ResidentTourPanel } from "@/components/portal/resident-tour-panel";

vi.mock("@/lib/portal-nav-client", () => ({
  usePortalNavigate: () => vi.fn(),
}));

afterEach(cleanup);

describe("ResidentTourPanel", () => {
  it("renders tour detail tabs on the inquiry detail route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tours: [
            {
              inquiryId: "inq-1",
              tourGroupId: null,
              status: "pending",
              propertyId: "prop-1",
              propertyTitle: "Maple House",
              roomLabel: "Room 2A",
              managerUserId: "mgr-1",
              managerLabel: "Jordan Lee",
              guestName: "Lucas",
              guestEmail: "lucas@example.com",
              guestPhone: "+12065550100",
              notes: "Looking for a quiet room.",
              instructions: null,
              proposedStart: "2026-07-31T19:30:00.000Z",
              proposedEnd: "2026-07-31T20:00:00.000Z",
              requestedWindows: [{ start: "2026-07-31T19:30:00.000Z", end: "2026-07-31T20:00:00.000Z" }],
              createdAt: "2026-07-31T18:00:00.000Z",
              confirmed: false,
              confirmedStart: null,
              confirmedEnd: null,
            },
          ],
        }),
      }),
    );

    render(<ResidentTourPanel basePath="/resident" inquiryId="inq-1" />);

    expect(await screen.findByText("Tour details")).toBeTruthy();
    expect(screen.getAllByText("Maple House").length).toBeGreaterThan(0);
    expect(screen.getByText("Lucas")).toBeTruthy();
    expect(screen.getByText("(206) 555-0100")).toBeTruthy();
    expect(screen.getByText("Looking for a quiet room.")).toBeTruthy();
  });
});
