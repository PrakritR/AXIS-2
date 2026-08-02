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

    render(<ResidentTourPanel basePath="/resident" inquiryId="inq-1" bucket="pending" />);

    expect(await screen.findByText("Tour details")).toBeTruthy();
    expect(screen.queryByText("Tour confirmed")).toBeNull();
    expect(screen.getAllByText("Maple House").length).toBeGreaterThan(0);
    expect(screen.getByText("Lucas")).toBeTruthy();
    expect(screen.getByText("(206) 555-0100")).toBeTruthy();
    expect(screen.getByText("Looking for a quiet room.")).toBeTruthy();
  });

  it("shows schedule tour add row without subtitle when there are no tours", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tours: [] }),
      }),
    );

    render(<ResidentTourPanel basePath="/resident" bucket="pending" />);

    expect(await screen.findByText("SCHEDULE TOUR")).toBeTruthy();
    expect(screen.getByText("Browse homes")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("Confirmed")).toBeTruthy();
    expect(screen.queryByText("Your scheduled property tours and requested times.")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Browse homes$/i })).toBeNull();
  });

  it("shows confirmed banner on approved tour detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tours: [
            {
              inquiryId: "inq-2",
              tourGroupId: null,
              status: "confirmed",
              propertyId: "prop-2",
              propertyTitle: "Alder Row",
              roomLabel: "Room 1",
              managerUserId: "mgr-1",
              managerLabel: "Jordan Lee",
              guestName: "Lucas",
              guestEmail: "lucas@example.com",
              guestPhone: null,
              notes: null,
              instructions: "Ring the side door.",
              proposedStart: "2026-08-02T19:30:00.000Z",
              proposedEnd: "2026-08-02T20:00:00.000Z",
              requestedWindows: [{ start: "2026-08-02T19:30:00.000Z", end: "2026-08-02T20:00:00.000Z" }],
              createdAt: "2026-08-01T18:00:00.000Z",
              confirmed: true,
              confirmedStart: "2026-08-02T19:30:00.000Z",
              confirmedEnd: "2026-08-02T20:00:00.000Z",
            },
          ],
        }),
      }),
    );

    render(<ResidentTourPanel basePath="/resident" inquiryId="inq-2" bucket="confirmed" />);

    expect(await screen.findByText("Tour confirmed")).toBeTruthy();
    expect(screen.getAllByText(/Alder Row/).length).toBeGreaterThan(0);
  });
});
