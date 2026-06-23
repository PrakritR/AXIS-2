import { describe, expect, it } from "vitest";
import { isOrphanCoManagerRelationship } from "@/lib/auth/purge-orphaned-co-manager-links";
import { proRelationshipRowsFromInvites, scopedRelationshipDeletesForRevokedInvite } from "@/lib/pro-relationships";
import type { AccountLinkInviteDto } from "@/lib/account-links";

describe("co-manager link cleanup helpers", () => {
  it("maps only accepted invites into relationship rows", () => {
    const invites: AccountLinkInviteDto[] = [
      {
        id: "invite-1",
        tabKind: "manager",
        status: "accepted",
        direction: "outgoing",
        inviterAxisId: "mgr-a",
        inviteeAxisId: "mgr-b",
        linkedAxisId: "mgr-b",
        linkedDisplayName: "Akashay",
        assignedPropertyIds: ["prop-1"],
        payoutPercentForManager: 15,
        coManagerPermissions: { inbox: true },
        createdAt: "2026-01-01T00:00:00.000Z",
        respondedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "invite-2",
        tabKind: "manager",
        status: "cancelled",
        direction: "outgoing",
        inviterAxisId: "mgr-a",
        inviteeAxisId: "mgr-deleted",
        linkedAxisId: "mgr-deleted",
        assignedPropertyIds: ["prop-2"],
        payoutPercentForManager: 10,
        coManagerPermissions: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        respondedAt: "2026-01-03T00:00:00.000Z",
      },
    ];

    const rows = proRelationshipRowsFromInvites(invites);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.linkedAxisId).toBe("mgr-b");
    expect(rows[0]?.linkedDisplayName).toBe("Akashay");
  });

  it("treats missing linked axis ids as orphan relationship rows", () => {
    const index = {
      userIds: new Set(["manager-1"]),
      axisIds: new Set(["axis-live"]),
      axisIdByUserId: new Map([["manager-1", "axis-live"]]),
    };

    expect(
      isOrphanCoManagerRelationship(
        { related_user_id: null, row_data: { linkedAxisId: "axis-deleted" } },
        index,
      ),
    ).toBe(true);
    expect(
      isOrphanCoManagerRelationship(
        { related_user_id: "manager-1", row_data: { linkedAxisId: "axis-live" } },
        index,
      ),
    ).toBe(false);
  });

  it("scopes revoke deletes to the two participant workspaces only", () => {
    const inviteA = {
      inviter_user_id: "manager-a",
      invitee_user_id: "manager-b",
      inviter_axis_id: "axis-a",
      invitee_axis_id: "axis-b",
    };
    expect(scopedRelationshipDeletesForRevokedInvite(inviteA)).toEqual([
      { managerUserId: "manager-a", linkedAxisId: "axis-b" },
      { managerUserId: "manager-b", linkedAxisId: "axis-a" },
    ]);

    const unrelatedRow = { managerUserId: "manager-c", linkedAxisId: "axis-b" };
    const scopes = scopedRelationshipDeletesForRevokedInvite(inviteA);
    expect(scopes).not.toContainEqual(unrelatedRow);
  });
});
