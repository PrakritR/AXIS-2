import type { AccountLinkInviteDto } from "@/lib/account-links";
import type { DemoApplicantRow } from "@/data/demo-portal";
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

  it("prefers invite assigned ids over stale relationship mirrors after unlink", () => {
    vi.spyOn(proRelationships, "readProRelationships").mockReturnValue([
      {
        id: "rel-1",
        linkedAxisId: "AXIS-PRIMARY",
        linkDirection: "incoming",
        perspective: "manager_tab",
        payoutPercentForManager: 15,
        assignedPropertyIds: ["still-linked", "unlinked-brooklyn"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    vi.spyOn(propertyPipeline, "readExtraListingsForUser").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readPendingManagerPropertiesForUser").mockReturnValue([]);
    vi.spyOn(portalDataStore, "readCachedAccountLinkInvites").mockReturnValue([
      {
        id: "rel-1",
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
        assignedPropertyIds: ["still-linked"],
        payoutPercentForManager: 15,
        coManagerPermissions: { residents: true },
        propertyCoManagerPermissions: { "still-linked": { residents: true } },
        createdAt: "2026-01-01T00:00:00.000Z",
        respondedAt: "2026-01-02T00:00:00.000Z",
      } satisfies AccountLinkInviteDto,
    ]);

    expect([...collectLinkedPropertyIds("co-user")]).toEqual(["still-linked"]);
  });

  it("hides a co-manager's linked (owner-attributed) rows once the property leaves the portfolio", async () => {
    // Unlink/delete scope must stick: a co-manager whose link to the property was
    // removed no longer has it in their linked cache, so an OWNER-attributed row
    // (managerUserId is the owner, not this co-manager) must disappear. This is the
    // genuine scoping guarantee — it is unaffected by the own-attribution shortcut,
    // because the row is not attributed to this viewer.
    const { applicationVisibleToPortalUser } = await import("@/lib/manager-portfolio-access");
    vi.spyOn(propertyPipeline, "readExtraListingsForUser").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readPendingManagerPropertiesForUser").mockReturnValue([]);
    vi.spyOn(proRelationships, "readProRelationships").mockReturnValue([]);
    vi.spyOn(portalDataStore, "readCachedAccountLinkInvites").mockReturnValue([]);

    expect(
      applicationVisibleToPortalUser(
        {
          id: "app-1",
          name: "Former Brooklyn Resident",
          property: "5259 Brooklyn Ave NE",
          stage: "Approved",
          bucket: "approved",
          detail: "",
          propertyId: "brooklyn-id",
          assignedPropertyId: "brooklyn-id",
          managerUserId: "owner-user",
        },
        "co-user",
        "residents",
      ),
    ).toBe(false);
  });

  it("shows a resident's freshly submitted application to its manager before the property cache hydrates", async () => {
    // Regression (pending-application-invisible): a resident applies to a live
    // listing; the server stores the row with manager_user_id = this manager and
    // returns it. On the manager's Applications tab the row is filtered client-side
    // by applicationVisibleToPortalUser. If the property pipeline cache has not
    // hydrated yet (its sync races the applications sync on first paint), the pid
    // is absent from ownedPropertyIdsForUser — yet the row IS the manager's own and
    // must still appear. Before the fix it vanished, matching the bug report
    // ("not seeing pending application... idk if it takes longer to process").
    const { applicationVisibleToPortalUser } = await import("@/lib/manager-portfolio-access");
    vi.spyOn(propertyPipeline, "readExtraListingsForUser").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readPendingManagerPropertiesForUser").mockReturnValue([]);
    vi.spyOn(proRelationships, "readProRelationships").mockReturnValue([]);
    vi.spyOn(portalDataStore, "readCachedAccountLinkInvites").mockReturnValue([]);

    expect(
      applicationVisibleToPortalUser(
        {
          id: "AXIS-NEWAPP1",
          name: "New Applicant",
          property: "The Magnolia",
          stage: "Submitted",
          bucket: "pending",
          detail: "",
          propertyId: "mgr-magnolia-2b-abc123",
          managerUserId: "manager-self",
          application: { propertyId: "mgr-magnolia-2b-abc123" } as DemoApplicantRow["application"],
        },
        "manager-self",
        "applications",
      ),
    ).toBe(true);
  });

  it("does not surface another manager's application even when the local cache is empty", async () => {
    // The own-attribution shortcut keys strictly on managerUserId === userId, so it
    // can never leak: a row attributed to a different manager, on a property this
    // user neither owns nor is linked to, stays hidden.
    const { applicationVisibleToPortalUser } = await import("@/lib/manager-portfolio-access");
    vi.spyOn(propertyPipeline, "readExtraListingsForUser").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readPendingManagerPropertiesForUser").mockReturnValue([]);
    vi.spyOn(proRelationships, "readProRelationships").mockReturnValue([]);
    vi.spyOn(portalDataStore, "readCachedAccountLinkInvites").mockReturnValue([]);

    expect(
      applicationVisibleToPortalUser(
        {
          id: "AXIS-OTHER1",
          name: "Someone Else's Applicant",
          property: "Not Yours",
          stage: "Submitted",
          bucket: "pending",
          detail: "",
          propertyId: "mgr-other-manager-prop",
          managerUserId: "another-manager",
          application: { propertyId: "mgr-other-manager-prop" } as DemoApplicantRow["application"],
        },
        "manager-self",
        "applications",
      ),
    ).toBe(false);
  });

  it("still shows a co-manager the owner's application on a linked property with the right grant", async () => {
    // The linked-property path is unchanged: an owner-attributed row remains visible
    // to a co-manager who currently has the applications grant on that property.
    const { applicationVisibleToPortalUser } = await import("@/lib/manager-portfolio-access");
    vi.spyOn(propertyPipeline, "readExtraListingsForUser").mockReturnValue([]);
    vi.spyOn(propertyPipeline, "readPendingManagerPropertiesForUser").mockReturnValue([]);
    vi.spyOn(proRelationships, "readProRelationships").mockReturnValue([]);
    vi.spyOn(portalDataStore, "readCachedAccountLinkInvites").mockReturnValue([
      {
        id: "invite-app",
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
        assignedPropertyIds: ["mgr-linked-1"],
        payoutPercentForManager: 15,
        coManagerPermissions: { applications: true },
        propertyCoManagerPermissions: { "mgr-linked-1": { applications: true } },
        createdAt: "2026-01-01T00:00:00.000Z",
        respondedAt: "2026-01-02T00:00:00.000Z",
      } satisfies AccountLinkInviteDto,
    ]);

    expect(
      applicationVisibleToPortalUser(
        {
          id: "AXIS-LINKED1",
          name: "Linked Applicant",
          property: "Linked House",
          stage: "Submitted",
          bucket: "pending",
          detail: "",
          propertyId: "mgr-linked-1",
          managerUserId: "owner-user",
          application: { propertyId: "mgr-linked-1" } as DemoApplicantRow["application"],
        },
        "co-user",
        "applications",
      ),
    ).toBe(true);
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
