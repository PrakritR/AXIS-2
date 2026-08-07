import { describe, expect, it } from "vitest";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";
import {
  propertyAcceptingOnlineApplications,
  readPropertyApplicationTemplatesForProspect,
  submissionAfterRemovingApplicationTemplate,
  syncPropertyApplicationTemplatesFromListing,
} from "@/lib/property-application-template-sync";
import { readPropertyApplicationTemplates } from "@/lib/property-application-templates";

describe("property application template explicit mode", () => {
  it("keeps an explicit empty list empty after sync", () => {
    const seeded = syncPropertyApplicationTemplatesFromListing(createDefaultListingSubmission());
    const templates = readPropertyApplicationTemplates(seeded);
    expect(templates.length).toBeGreaterThan(0);

    const cleared = submissionAfterRemovingApplicationTemplate(seeded, []);
    expect(cleared.propertyApplicationTemplatesExplicit).toBe(true);
    expect(readPropertyApplicationTemplates(cleared)).toEqual([]);

    const resynced = syncPropertyApplicationTemplatesFromListing(cleared);
    expect(readPropertyApplicationTemplates(resynced)).toEqual([]);
    expect(propertyAcceptingOnlineApplications(resynced)).toBe(false);
  });

  it("allows deleting every default template when explicit", () => {
    const sub = syncPropertyApplicationTemplatesFromListing(createDefaultListingSubmission());
    let templates = readPropertyApplicationTemplates(sub);
    while (templates.length > 0) {
      templates = templates.slice(1);
    }
    const cleared = submissionAfterRemovingApplicationTemplate(sub, templates);
    expect(readPropertyApplicationTemplatesForProspect(cleared)).toEqual([]);
    expect(propertyAcceptingOnlineApplications(cleared)).toBe(false);
  });

  it("still auto-seeds when the manager has not taken explicit control", () => {
    const sub = createDefaultListingSubmission();
    const synced = syncPropertyApplicationTemplatesFromListing(sub);
    expect(readPropertyApplicationTemplatesForProspect(synced).length).toBeGreaterThan(0);
    expect(propertyAcceptingOnlineApplications(synced)).toBe(true);
  });
});
