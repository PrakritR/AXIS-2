import { describe, expect, it } from "vitest";
import {
  TOUR_CONFIRMED_TENANT_SUBJECT,
  TOUR_REQUEST_MANAGER_SUBJECT,
  buildTourApplyUrl,
  buildTourConfirmedTenantBody,
  buildTourNotificationContext,
  buildTourRequestManagerBody,
  formatTourTimeRange,
} from "@/lib/tour-notifications";

describe("tour-notifications", () => {
  const baseCtx = buildTourNotificationContext({
    origin: "https://example.com",
    guestName: "Alex Chen",
    guestEmail: "alex@example.com",
    guestPhone: "(206) 555-0100",
    propertyId: "prop_demo_1",
    propertyTitle: "Sunset House",
    propertyAddress: "123 Main St, Seattle, WA",
    roomLabel: "Room 2A",
    tourStartIso: "2026-06-22T18:00:00.000Z",
    tourEndIso: "2026-06-22T18:30:00.000Z",
    notes: "Looking for a quiet room.",
    managerLabel: "Jordan Lee",
  });

  it("builds manager request subject and body", () => {
    expect(TOUR_REQUEST_MANAGER_SUBJECT).toContain("tour");
    const body = buildTourRequestManagerBody(baseCtx);
    expect(body).toContain("Alex Chen");
    expect(body).toContain("alex@example.com");
    expect(body).toContain("Sunset House");
    expect(body).toContain("123 Main St");
    expect(body).toContain("Room 2A");
    expect(body).toContain("Looking for a quiet room.");
  });

  it("builds tenant confirmation with apply link CTA", () => {
    expect(TOUR_CONFIRMED_TENANT_SUBJECT).toContain("confirmed");
    const body = buildTourConfirmedTenantBody(baseCtx);
    expect(body).toContain("Hi Alex Chen");
    expect(body).toContain("Sunset House");
    expect(body).toContain("123 Main St");
    expect(body).toContain("apply for this home");
    expect(body).toContain("https://example.com/rent/apply?propertyId=prop_demo_1&roomName=Room+2A");
  });

  it("formats tour time range", () => {
    const label = formatTourTimeRange("2026-06-22T18:00:00.000Z", "2026-06-22T18:30:00.000Z");
    expect(label).toMatch(/–| - /);
  });

  it("builds apply url with property id", () => {
    expect(buildTourApplyUrl("https://example.com", "prop_demo_1", "Room 2A")).toContain("propertyId=prop_demo_1");
  });
});
