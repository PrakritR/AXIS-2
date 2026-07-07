import type { AccountLinkInviteDto } from "@/lib/account-links";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  collectLinkedPropertyIds,
  readLinkedListingsForUser,
  resolvePropertyLabelForId,
  safePropertyOptionLabel,
} from "@/lib/manager-portfolio-access";
import * as proRelationships from "@/lib/pro-relationships";
import * as propertyPipeline from "@/lib/demo-property-pipeline";
import * as portalDataStore from "@/lib/portal-data-store";

describe("manager portfolio access", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("collects assigned property ids from co-manager relationships", () => {
    vi.spyOn(proRelationships, "readProRelationships").mockReturnValue([
      {
        id: "rel-1",
        linkedAxisId: "AXIS-PRIMARY",
        linkDirection: "incoming",
        perspective: "manager_tab",
        payoutPercentForManager: 15,
        assignedPropertyIds: ["mgr-house-a", "pend-house-b"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    vi.spyOn(portalDataStore, "readCachedAccountLinkInvites").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readExtraListingsForUser").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readPendingManagerPropertiesForUser").mockReturnValue([]);

    expect([...collectLinkedPropertyIds("co-user")]).toEqual(["mgr-house-a", "pend-house-b"]);
  });

  it("falls back to incoming accepted invites when relationship rows are empty", () => {
    vi.spyOn(proRelationships, "readProRelationships").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readExtraListingsForUser").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readPendingManagerPropertiesForUser").mockReturnValue([]);
    vi.spyOn(portalDataStore, "readCachedAccountLinkInvites").mockReturnValue([
      {
        id: "invite-1",
        tabKind: "manager",
        status: "accepted",
        direction: "incoming",
        inviterAxisId: "axis-owner",
        inviteeAxisId: "axis-co",
        inviterDisplayName: "Owner",
        inviteeDisplayName: "Co",
        linkedAxisId: "axis-owner",
        linkedDisplayName: "Owner",
        linkedUserId: "owner-user",
        assignedPropertyIds: ["mgr-live-1"],
        payoutPercentForManager: 15,
        coManagerPermissions: { properties: true },
        propertyCoManagerPermissions: { "mgr-live-1": { properties: true } },
        createdAt: "2026-01-01T00:00:00.000Z",
        respondedAt: "2026-01-02T00:00:00.000Z",
      } satisfies AccountLinkInviteDto,
    ]);

    expect([...collectLinkedPropertyIds("co-user")]).toEqual(["mgr-live-1"]);
  });

  it("ignores outgoing relationship assignments for linked access", () => {
    vi.spyOn(proRelationships, "readProRelationships").mockReturnValue([
      {
        id: "rel-1",
        linkedAxisId: "AXIS-CO",
        linkDirection: "outgoing",
        perspective: "manager_tab",
        payoutPercentForManager: 15,
        assignedPropertyIds: ["mgr-owned-1"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    vi.spyOn(portalDataStore, "readCachedAccountLinkInvites").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readExtraListingsForUser").mockReturnValue([
      {
        id: "mgr-owned-1",
        title: "Owned",
        tagline: "",
        address: "1 Main",
        zip: "98101",
        neighborhood: "Downtown",
        beds: 2,
        baths: 1,
        rentLabel: "$2000",
        available: "Now",
        petFriendly: true,
        buildingId: "b1",
        buildingName: "Owned",
        unitLabel: "A",
        mapLat: 0,
        mapLng: 0,
        managerUserId: "owner-user",
        adminPublishLive: true,
      },
    ]);
    vi.spyOn(propertyPipeline, "readPendingManagerPropertiesForUser").mockReturnValue([]);

    expect([...collectLinkedPropertyIds("owner-user")]).toEqual([]);
  });

  it("resolves linked listings from owner extras and pending queues", () => {
    vi.spyOn(proRelationships, "readProRelationships").mockReturnValue([
      {
        id: "rel-1",
        linkedAxisId: "AXIS-PRIMARY",
        linkDirection: "incoming",
        perspective: "manager_tab",
        payoutPercentForManager: 15,
        assignedPropertyIds: ["mgr-live-1", "pend-1"],
        coManagerPermissions: { properties: true, editListings: true },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    vi.spyOn(portalDataStore, "readCachedAccountLinkInvites").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readExtraListingsForUser").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readPendingManagerPropertiesForUser").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readAllExtraListings").mockReturnValue([
      {
        id: "mgr-live-1",
        title: "Live House",
        tagline: "",
        address: "1 Main St",
        zip: "98101",
        neighborhood: "Downtown",
        beds: 2,
        baths: 1,
        rentLabel: "$2000",
        available: "Now",
        petFriendly: true,
        buildingId: "b1",
        buildingName: "Live House",
        unitLabel: "A",
        mapLat: 0,
        mapLng: 0,
        managerUserId: "owner-user",
        adminPublishLive: true,
      },
    ]);
    vi.spyOn(propertyPipeline, "readAllPendingManagerProperties").mockReturnValue([
      {
        id: "pend-1",
        submittedAt: "2026-01-02T00:00:00.000Z",
        buildingName: "Pending House",
        address: "2 Main St",
        zip: "98101",
        neighborhood: "Downtown",
        unitLabel: "B",
        beds: 1,
        baths: 1,
        monthlyRent: 1500,
        petFriendly: false,
        tagline: "Pending",
        submittedByUserId: "owner-user",
      },
    ]);

    const rows = readLinkedListingsForUser("co-user");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.listing.id).sort()).toEqual(["mgr-live-1", "pend-1"]);
    expect(rows.every((r) => r.ownerUserId === "owner-user")).toBe(true);
    expect(rows[0]?.canEdit).toBe(true);
  });
});

describe("safePropertyOptionLabel", () => {
  it("prefers the first human-friendly candidate", () => {
    expect(safePropertyOptionLabel(["Magnolia House — 5 rooms", "ignored"], "seedwf_x_prop-magnolia")).toBe(
      "Magnolia House — 5 rooms",
    );
  });

  it("skips a raw seed-id title and falls back to the building name", () => {
    // Regression: an older seed left title = "Seed Property seed-1782590281847".
    expect(
      safePropertyOptionLabel(
        ["Seed Property seed-1782590281847", "Seed Building", "123 Seed St"],
        "test-prop-seed-1782590281847",
      ),
    ).toBe("Seed Building");
  });

  it("never returns the bare property id", () => {
    expect(safePropertyOptionLabel(["test-prop-seed-1782590281847"], "test-prop-seed-1782590281847")).toBe(
      "Untitled property",
    );
    expect(safePropertyOptionLabel([undefined, "", null], "mgr-abcd-efgh-123456")).toBe("Untitled property");
  });

  it("rejects id-shaped tokens (uuid, seedwf key, long digit runs)", () => {
    expect(safePropertyOptionLabel(["a1b2c3d4-0000-1111-2222-333344445555", "Real Name"], "id")).toBe("Real Name");
    expect(safePropertyOptionLabel(["seedwf_f707ad54_prop-cedar", "Cedar Flat 2B"], "seedwf_f707ad54_prop-cedar")).toBe(
      "Cedar Flat 2B",
    );
  });

  it("keeps ordinary names and addresses that merely contain the word seed", () => {
    expect(safePropertyOptionLabel(["123 Seed St, Austin, TX"], "p1")).toBe("123 Seed St, Austin, TX");
  });
});

describe("resolvePropertyLabelForId", () => {
  it("resolves live and pending pipeline rows", () => {
    vi.spyOn(propertyPipeline, "readAllExtraListings").mockReturnValue([
      {
        id: "mgr-live-1",
        title: "Live House",
        tagline: "",
        address: "1 Main St",
        zip: "98101",
        neighborhood: "Downtown",
        beds: 2,
        baths: 1,
        rentLabel: "$2000",
        available: "Now",
        petFriendly: true,
        buildingId: "b1",
        buildingName: "Live House",
        unitLabel: "A",
        mapLat: 0,
        mapLng: 0,
        managerUserId: "owner-user",
        adminPublishLive: true,
      },
    ]);
    vi.spyOn(propertyPipeline, "readAllPendingManagerProperties").mockReturnValue([
      {
        id: "pend-1",
        submittedAt: "2026-01-02T00:00:00.000Z",
        buildingName: "Pending House",
        address: "2 Main St",
        zip: "98101",
        neighborhood: "Downtown",
        unitLabel: "B",
        beds: 1,
        baths: 1,
        monthlyRent: 1500,
        petFriendly: false,
        tagline: "Pending",
        submittedByUserId: "owner-user",
      },
    ]);

    expect(resolvePropertyLabelForId("mgr-live-1", "mgr-live-1")).toBe("Live House");
    expect(resolvePropertyLabelForId("pend-1", "pend-1")).toBe("Pending House · B · 2 Main St");
  });
});
