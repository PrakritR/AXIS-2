import { describe, expect, it } from "vitest";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";
import {
  buildLeaseTemplateSeeds,
  resolvePropertyLeaseTemplateForApplication,
  syncPropertyLeaseTemplatesFromListing,
} from "@/lib/property-lease-template-sync";
import { readPropertyLeaseTemplates } from "@/lib/property-lease-templates";
import { SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/lease-terms";

describe("property lease template sync", () => {
  it("seeds fixed-term and month-to-month templates from listing offered terms", () => {
    const sub = createDefaultListingSubmission();
    sub.allowedLeaseTerms = ["12-Month", "Month-to-Month"];
    const synced = syncPropertyLeaseTemplatesFromListing(sub);
    const templates = readPropertyLeaseTemplates(synced);
    expect(templates).toHaveLength(3);
    expect(templates.map((t) => t.listingSeedKey).sort()).toEqual(
      ["fixed-12-month", "month-to-month", "short-term"].sort(),
    );
    expect(templates.find((t) => t.listingSeedKey === "fixed-12-month")?.applicationLeaseTerms).toEqual([
      "12-Month",
    ]);
  });

  it("adds short-term template when short-term stays are enabled", () => {
    const sub = createDefaultListingSubmission();
    sub.allowedLeaseTerms = ["12-Month"];
    sub.shortTermRentalsAllowed = true;
    const seeds = buildLeaseTemplateSeeds(sub);
    expect(seeds.some((s) => s.seedKey === "short-term")).toBe(true);
    expect(seeds.find((s) => s.seedKey === "short-term")?.kind).toBe("short-term");
    const synced = syncPropertyLeaseTemplatesFromListing(sub);
    const short = readPropertyLeaseTemplates(synced).find((t) => t.listingSeedKey === "short-term");
    expect(short?.applicationLeaseTerms).toEqual([SHORT_TERM_LEASE_TERM]);
    expect(short?.kind).toBe("short-term");
  });

  it("resolves the month-to-month template for month-to-month applicants", () => {
    const sub = createDefaultListingSubmission();
    sub.allowedLeaseTerms = ["12-Month", "Month-to-Month"];
    const synced = syncPropertyLeaseTemplatesFromListing(sub);
    const picked = resolvePropertyLeaseTemplateForApplication(synced, { leaseTerm: "Month-to-Month" });
    expect(picked?.listingSeedKey).toBe("month-to-month");
  });

  it("resolves fixed-term template for legacy 12 months resident labels", () => {
    const sub = createDefaultListingSubmission();
    sub.allowedLeaseTerms = ["12-Month", "Month-to-Month"];
    const synced = syncPropertyLeaseTemplatesFromListing(sub);
    const picked = resolvePropertyLeaseTemplateForApplication(synced, { leaseTerm: "12 months" });
    expect(picked?.listingSeedKey).toBe("fixed-12-month");
  });

  it("resolves fixed-term template for 12-month applicants", () => {
    const sub = createDefaultListingSubmission();
    sub.allowedLeaseTerms = ["12-Month", "Month-to-Month"];
    const synced = syncPropertyLeaseTemplatesFromListing(sub);
    const picked = resolvePropertyLeaseTemplateForApplication(synced, { leaseTerm: "12-Month" });
    expect(picked?.listingSeedKey).toBe("fixed-12-month");
  });

  it("seeds a dedicated 3-month lease template when 3-month is offered", () => {
    const sub = createDefaultListingSubmission();
    sub.allowedLeaseTerms = ["3-Month", "Month-to-Month", "Custom"];
    sub.shortTermRentalsAllowed = true;
    const synced = syncPropertyLeaseTemplatesFromListing(sub);
    const templates = readPropertyLeaseTemplates(synced);
    expect(templates.map((t) => t.listingSeedKey).sort()).toEqual(
      ["custom-term", "fixed-12-month", "fixed-3-month", "month-to-month", "short-term"].sort(),
    );
    const three = resolvePropertyLeaseTemplateForApplication(synced, { leaseTerm: "3-Month" });
    expect(three?.listingSeedKey).toBe("fixed-3-month");
    const custom = resolvePropertyLeaseTemplateForApplication(synced, { leaseTerm: "Custom" });
    expect(custom?.listingSeedKey).toBe("custom-term");
    const short = resolvePropertyLeaseTemplateForApplication(synced, {
      leaseTerm: SHORT_TERM_LEASE_TERM,
      rentalType: "short_term",
    });
    expect(short?.listingSeedKey).toBe("short-term");
  });

  it("preserves manager edits on re-sync", () => {
    const sub = createDefaultListingSubmission();
    sub.allowedLeaseTerms = ["12-Month"];
    let synced = syncPropertyLeaseTemplatesFromListing(sub);
    const templates = readPropertyLeaseTemplates(synced);
    templates[0] = { ...templates[0]!, customLeaseTerms: "No pets on patio.", leaseConfigMode: "custom", leaseCustomKind: "terms" };
    synced = { ...synced, propertyLeaseTemplates: templates };
    synced = syncPropertyLeaseTemplatesFromListing(synced);
    const again = readPropertyLeaseTemplates(synced)[0]!;
    expect(again.customLeaseTerms).toBe("No pets on patio.");
    expect(again.leaseConfigMode).toBe("custom");
  });

  it("always includes 12-month and short-term house lease templates", () => {
    const sub = createDefaultListingSubmission();
    sub.allowedLeaseTerms = ["Month-to-Month"];
    sub.shortTermRentalsAllowed = false;
    const synced = syncPropertyLeaseTemplatesFromListing(sub);
    const keys = readPropertyLeaseTemplates(synced).map((t) => t.listingSeedKey).sort();
    expect(keys).toContain("fixed-12-month");
    expect(keys).toContain("short-term");
  });
});
