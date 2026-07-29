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
  parseApplicationBucket,
  parseLeasePipelineTab,
  parsePaymentDirection,
  parsePaymentBucket,
  parseServiceRequestBucket,
  parseWorkOrderBucket,
  propertyDetailHref,
  residentDetailHref,
  calendarViewHref,
  teamLinkHref,
  applicationDetailHref,
  applicationListHref,
  leaseDetailHref,
  leaseListHref,
  paymentDetailHref,
  paymentListHref,
  serviceRequestDetailHref,
  serviceRequestListHref,
  workOrderDetailHref,
  workOrderListHref,
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

  it("parses and builds Appendix D5 manager detail routes", () => {
    expect(parseApplicationBucket("approved")).toBe("approved");
    expect(parseApplicationBucket("bogus")).toBe("pending");
    expect(parseLeasePipelineTab("signed")).toBe("signed");
    expect(parseLeasePipelineTab(undefined)).toBe("manager");
    expect(parsePaymentDirection("outgoing")).toBe("outgoing");
    expect(parsePaymentBucket("paid")).toBe("paid");
    expect(parseServiceRequestBucket("denied")).toBe("denied");
    expect(parseWorkOrderBucket("scheduled")).toBe("scheduled");

    expect(applicationListHref("/portal", "pending")).toBe("/portal/applications/pending");
    expect(applicationDetailHref("/portal", "pending", "AXIS-123")).toBe(
      "/portal/applications/pending/AXIS-123",
    );
    expect(leaseListHref("/portal", "manager")).toBe("/portal/leases/manager");
    expect(leaseDetailHref("/portal", "signed", "lease-1")).toBe("/portal/leases/signed/lease-1");
    expect(paymentListHref("/portal", "incoming", "overdue")).toBe("/portal/payments/incoming/overdue");
    expect(paymentDetailHref("/portal", "incoming", "pending", "chg-1")).toBe(
      "/portal/payments/incoming/pending/chg-1",
    );
    expect(serviceRequestListHref("/portal", "approved")).toBe("/portal/services/requests/approved");
    expect(serviceRequestDetailHref("/portal", "pending", "sr-1")).toBe(
      "/portal/services/requests/pending/sr-1",
    );
    expect(workOrderListHref("/portal", "open")).toBe("/portal/services/work-orders/open");
    expect(workOrderDetailHref("/portal", "completed", "wo-1")).toBe(
      "/portal/services/work-orders/completed/wo-1",
    );
    expect(applicationDetailHref("/portal", "pending", "mgr foo")).toBe(
      "/portal/applications/pending/mgr%20foo",
    );
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
