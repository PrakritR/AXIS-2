import { describe, expect, it } from "vitest";
import {
  buildCustomBuilderLeaseHtml,
  buildProplaneLeaseHtmlFromSections,
  inferLeaseKindFromText,
  splitLeaseTextIntoSections,
} from "@/lib/lease-pdf-parse";

describe("lease-pdf-parse", () => {
  it("infers short-term leases from nightly language", () => {
    expect(inferLeaseKindFromText("Short-term guest stay with nightly rate and check-out on Sunday.")).toBe(
      "short-term",
    );
  });

  it("infers time-based leases from hourly language", () => {
    expect(inferLeaseKindFromText("Tenant agrees to pay $25 per hour for time-based occupancy.")).toBe("time-based");
  });

  it("defaults to long-term for standard tenancy language", () => {
    expect(inferLeaseKindFromText("12-month residential lease between landlord and tenant.")).toBe("long-term");
  });

  it("splits numbered lease sections", () => {
    const text = `1. PARTIES
Landlord and Resident agree.

2. RENT
Monthly rent is due on the first.`;
    const sections = splitLeaseTextIntoSections(text);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections[0]?.title.toLowerCase()).toContain("parties");
  });

  it("builds PropPlane HTML with placement and signature blocks", () => {
    const html = buildProplaneLeaseHtmlFromSections({
      sections: [{ title: "Rent", body: "Monthly rent is $1,200." }],
      docName: "Sample.pdf",
      docUrl: "/api/portal/lease-template?path=test",
    });
    expect(html).toContain("Imported from your uploaded lease");
    expect(html).toContain("Placement summary");
    expect(html).toContain("Electronic signature");
  });

  it("builds a custom builder shell", () => {
    const html = buildCustomBuilderLeaseHtml("My custom lease");
    expect(html).toContain("Parties and premises");
    expect(html).toContain("My custom lease");
  });
});
