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
    expect(templates).toHaveLength(2);
    expect(templates.map((t) => t.listingSeedKey).sort()).toEqual(["fixed-term", "month-to-month"]);
    expect(templates.find((t) => t.listingSeedKey === "fixed-term")?.applicationLeaseTerms).toEqual([
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

  it("resolves fixed-term template for 12-month applicants", () => {
    const sub = createDefaultListingSubmission();
    sub.allowedLeaseTerms = ["12-Month", "Month-to-Month"];
    const synced = syncPropertyLeaseTemplatesFromListing(sub);
    const picked = resolvePropertyLeaseTemplateForApplication(synced, { leaseTerm: "12-Month" });
    expect(picked?.listingSeedKey).toBe("fixed-term");
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
});
