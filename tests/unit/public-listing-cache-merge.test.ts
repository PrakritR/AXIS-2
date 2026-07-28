// @vitest-environment jsdom
//
// The public catalog and the manager's own editable catalog share ONE browser
// store. Since the public payload became an allowlist
// (`publicListingProjection`), caching it must never downgrade a row the owner
// edits — their next House-details save mirrors that row straight back into
// `property_data`.
import { describe, expect, it } from "vitest";
import { cachePublicExtraListings, readExtraListingsForUser } from "@/lib/demo-property-pipeline";
import type { MockProperty } from "@/data/types";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

const MANAGER = "mgr-cache-merge";

// The store is session/memory backed and module-level, so it outlives a single
// test. Each case gets its own listing id rather than trying to reset it.
let seq = 0;
const nextId = () => `mgr-cache-${(seq += 1)}`;

function rowFor(id: string): MockProperty | undefined {
  return readExtraListingsForUser(MANAGER).find((p) => p.id === id);
}

/** What the manager portal holds: the full submission, private fields and all. */
function storedListing(id: string): MockProperty {
  return {
    id,
    title: "Ballard House",
    buildingName: "Ballard House",
    address: "1 Main St",
    rentLabel: "from $900/mo",
    managerUserId: MANAGER,
    adminPublishLive: true,
    listingSubmission: {
      v: 1,
      tagline: "Bright rooms",
      wifiPassword: "welcome-home-2026",
      leaseConfigMode: "custom",
      leaseCustomKind: "document",
      leaseTemplateDocUrl: "/api/portal/lease-template?path=abc/1.pdf",
      serviceRequestOptions: [{ id: "s1", name: "Parking" }],
    } as unknown as ManagerListingSubmissionV1,
  } as unknown as MockProperty;
}

/** What the anonymous endpoint returns for the same listing: no private fields. */
function projectedListing(id: string, tagline = "Bright rooms"): MockProperty {
  return {
    id,
    title: "Ballard House (renamed)",
    buildingName: "Ballard House",
    address: "1 Main St",
    rentLabel: "from $950/mo",
    managerUserId: MANAGER,
    adminPublishLive: true,
    publicProjection: true,
    listingSubmission: { v: 1, tagline } as unknown as ManagerListingSubmissionV1,
  } as unknown as MockProperty;
}

describe("cachePublicExtraListings", () => {
  it("never downgrades an existing row's submission to the public projection", () => {
    const id = nextId();
    cachePublicExtraListings([storedListing(id)], { silent: true });
    cachePublicExtraListings([projectedListing(id)], { silent: true });

    const sub = rowFor(id)!.listingSubmission as unknown as Record<string, unknown>;
    // Losing any of these is unrecoverable: the manager's next save mirrors the
    // cached row back into property_data.
    expect(sub.wifiPassword).toBe("welcome-home-2026");
    expect(sub.leaseTemplateDocUrl).toBe("/api/portal/lease-template?path=abc/1.pdf");
    expect(sub.leaseConfigMode).toBe("custom");
    expect(sub.serviceRequestOptions).toHaveLength(1);
  });

  it("still refreshes the public fields of an existing row", () => {
    const id = nextId();
    cachePublicExtraListings([storedListing(id)], { silent: true });
    cachePublicExtraListings([projectedListing(id)], { silent: true });

    const row = rowFor(id)!;
    expect(row.title).toBe("Ballard House (renamed)");
    expect(row.rentLabel).toBe("from $950/mo");
  });

  it("caches a listing it has never seen, projection and all", () => {
    const id = nextId();
    cachePublicExtraListings([projectedListing(id)], { silent: true });

    expect(rowFor(id)!.listingSubmission?.tagline).toBe("Bright rooms");
  });

  it("lets one public payload replace another, so a public refresh is not frozen", () => {
    // The guard is only against DOWNGRADING an authoritative row. Two public
    // payloads for the same listing must still refresh each other, or an
    // anonymous visitor is stuck on whatever they first loaded.
    const id = nextId();
    cachePublicExtraListings([projectedListing(id)], { silent: true });
    cachePublicExtraListings([projectedListing(id, "Now with parking")], { silent: true });

    expect(rowFor(id)!.listingSubmission?.tagline).toBe("Now with parking");
  });

  it("lets the owner's authoritative row replace a cached projection", () => {
    const id = nextId();
    cachePublicExtraListings([projectedListing(id)], { silent: true });
    cachePublicExtraListings([storedListing(id)], { silent: true });

    const sub = rowFor(id)!.listingSubmission as unknown as Record<string, unknown>;
    expect(sub.wifiPassword).toBe("welcome-home-2026");
  });
});
