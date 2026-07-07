import { describe, expect, it } from "vitest";
import type { AccountLinkInviteDto } from "@/lib/account-links";
import {
  listOutgoingCoManagerLinks,
  listOutgoingCoManagersForProperty,
  propertyIdInAssignedList,
  resolveAssignedPropertyId,
} from "@/lib/co-manager-property-links";
import type { ProRelationshipRecord } from "@/lib/pro-relationships";

function makeInvite(overrides: Partial<AccountLinkInviteDto> = {}): AccountLinkInviteDto {
  return {
    id: "inv-1",
    tabKind: "manager",
    status: "accepted",
    direction: "outgoing",
    inviterAxisId: "AXIS-OWNER",
    inviteeAxisId: "AXIS-CO",
    inviterDisplayName: "Owner",
    inviteeDisplayName: "Co Manager",
    linkedAxisId: "AXIS-CO",
    linkedDisplayName: "Ambika Mago",
    linkedUserId: "user-co",
    assignedPropertyIds: ["mgr-prop-a", "mgr-prop-b"],
    payoutPercentForManager: 15,
    coManagerPermissions: { applications: true },
    propertyCoManagerPermissions: {
      "mgr-prop-a": { applications: true },
      "mgr-prop-b": { applications: true },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    respondedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function makeLocalRow(overrides: Partial<ProRelationshipRecord> = {}): ProRelationshipRecord {
  return {
    id: "rel-1",
    linkedAxisId: "AXIS-CO",
    linkedDisplayName: "Ambika Mago",
    linkedUserId: "user-co",
    linkDirection: "outgoing",
    perspective: "manager_tab",
    payoutPercentForManager: 15,
    assignedPropertyIds: ["mgr-prop-a"],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("co-manager-property-links", () => {
  it("matches property ids with samePropertyId token normalization", () => {
    expect(propertyIdInAssignedList("mgr-prop-a", ["mgr-prop-a"])).toBe(true);
    expect(resolveAssignedPropertyId("mgr-prop-a::extra", ["mgr-prop-aextra"])).toBe("mgr-prop-aextra");
    expect(propertyIdInAssignedList("other", ["mgr-prop-a"])).toBe(false);
  });

  it("lists outgoing co-managers for a property from remote invites and drafts", () => {
    const invite = makeInvite();
    const links = listOutgoingCoManagerLinks({
      useRemote: true,
      remoteInvites: [invite],
      localRows: [],
      inviteDrafts: {
        [invite.id]: {
          assignedPropertyIds: ["mgr-prop-a", "mgr-prop-c"],
          propertyCoManagerPermissions: {},
        },
      },
    });
    expect(links).toHaveLength(1);
    expect(links[0]!.assignedPropertyIds).toEqual(["mgr-prop-a", "mgr-prop-c"]);
    expect(listOutgoingCoManagersForProperty("mgr-prop-c", links)).toHaveLength(1);
    expect(listOutgoingCoManagersForProperty("mgr-prop-b", links)).toHaveLength(0);
  });

  it("falls back to local relationship rows when remote is unavailable", () => {
    const links = listOutgoingCoManagerLinks({
      useRemote: false,
      remoteInvites: [],
      localRows: [makeLocalRow()],
      inviteDrafts: {},
    });
    expect(links).toHaveLength(1);
    expect(listOutgoingCoManagersForProperty("mgr-prop-a", links)[0]?.linkedDisplayName).toBe("Ambika Mago");
  });

  it("uses invite drafts when remote assigned ids are stale", () => {
    const invite = makeInvite({ assignedPropertyIds: [] });
    const links = listOutgoingCoManagerLinks({
      useRemote: true,
      remoteInvites: [invite],
      localRows: [],
      inviteDrafts: {
        [invite.id]: {
          assignedPropertyIds: ["mgr-prop-a", "mgr-prop-b"],
          propertyCoManagerPermissions: {},
        },
      },
    });
    expect(listOutgoingCoManagersForProperty("mgr-prop-a", links)).toHaveLength(1);
    expect(listOutgoingCoManagersForProperty("mgr-prop-b", links)).toHaveLength(1);
  });
});
