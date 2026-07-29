// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import {
  parsePropertyDetailTab,
  parseResidentDetailTab,
  parseCalendarViewTab,
  parseTeamLinkTab,
  propertyDetailHref,
  residentDetailHref,
  calendarViewHref,
  teamLinkHref,
} from "@/lib/portal-detail-routes";

describe("portal-detail-routes", () => {
  it("parses property detail tabs with preview fallback", () => {
    expect(parsePropertyDetailTab("lease")).toBe("lease");
    expect(parsePropertyDetailTab("bogus")).toBe("preview");
    expect(parsePropertyDetailTab(undefined)).toBe("preview");
  });

  it("parses resident detail tabs with application fallback", () => {
    expect(parseResidentDetailTab("payments")).toBe("payments");
    expect(parseResidentDetailTab("")).toBe("application");
  });

  it("builds encoded detail hrefs", () => {
    expect(propertyDetailHref("/portal", "listed", "mgr-foo bar", "preview")).toBe(
      "/portal/properties/listed/mgr-foo%20bar/preview",
    );
    expect(residentDetailHref("/portal", "current", "res-1", "lease")).toBe(
      "/portal/residents/current/res-1/lease",
    );
    expect(calendarViewHref("/portal", "tours")).toBe("/portal/calendar/tours");
    expect(teamLinkHref("/portal", "linked")).toBe("/portal/relationships/linked");
  });

  it("parses calendar and team routed tabs", () => {
    expect(parseCalendarViewTab("services")).toBe("services");
    expect(parseCalendarViewTab("")).toBe("all");
    expect(parseTeamLinkTab("linked")).toBe("linked");
    expect(parseTeamLinkTab(undefined)).toBe("pending");
  });
});

describe("PortalListControlStack", () => {
  it("renders filter, destinations, and search slots", () => {
    render(
      <PortalListControlStack
        filterRow={<span data-testid="filter">Filter</span>}
        primaryAction={<button type="button">Create</button>}
        destinations={[
          { id: "a", label: "Active", href: "/portal/x/a" },
          { id: "b", label: "Archived", href: "/portal/x/b" },
        ]}
        activeDestinationId="a"
        search={{
          value: "",
          onChange: () => {},
          placeholder: "Search items",
        }}
      />,
    );
    expect(screen.getByTestId("filter").textContent).toBe("Filter");
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Active/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByPlaceholderText("Search items")).toBeTruthy();
  });
});

describe("PortalSectionActionRow", () => {
  it("renders primary actions and separated destructive group", () => {
    const { container } = render(
      <PortalSectionActionRow destructive={<button type="button">Delete</button>}>
        <button type="button">Edit</button>
      </PortalSectionActionRow>,
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(container.querySelector("[data-slot=portal-section-action-row-destructive]")).toBeTruthy();
  });
});
