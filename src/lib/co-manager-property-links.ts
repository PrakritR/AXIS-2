import type { AccountLinkInviteDto } from "@/lib/account-links";
import type { PropertyCoManagerPermissions } from "@/lib/co-manager-permissions";
import { samePropertyId } from "@/lib/co-manager-calendar";
import type { ProRelationshipRecord } from "@/lib/pro-relationships";

export type CoManagerPropertyLink = {
  id: string;
  linkedAxisId: string;
  linkedDisplayName?: string | null;
  linkedUserId?: string;
  assignedPropertyIds: string[];
  propertyCoManagerPermissions: PropertyCoManagerPermissions;
};

export type InviteDraftLike = {
  assignedPropertyIds: string[];
  propertyCoManagerPermissions: PropertyCoManagerPermissions;
};

export function resolveAssignedPropertyId(
  propertyId: string,
  assignedPropertyIds: string[],
): string | null {
  const needle = propertyId.trim();
  if (!needle) return null;
  return assignedPropertyIds.find((id) => samePropertyId(id, needle)) ?? null;
}

export function propertyIdInAssignedList(
  propertyId: string,
  assignedPropertyIds: string[],
): boolean {
  return resolveAssignedPropertyId(propertyId, assignedPropertyIds) != null;
}

/** Outgoing co-manager links the owner invited (remote invites + local fallback). */
export function listOutgoingCoManagerLinks(opts: {
  useRemote: boolean;
  remoteInvites: AccountLinkInviteDto[];
  localRows: ProRelationshipRecord[];
  inviteDrafts: Record<string, InviteDraftLike>;
}): CoManagerPropertyLink[] {
  const { useRemote, remoteInvites, localRows, inviteDrafts } = opts;

  if (useRemote) {
    return remoteInvites
      .filter((inv) => inv.status === "accepted" && inv.direction === "outgoing")
      .map((inv) => {
        const draft = inviteDrafts[inv.id];
        return {
          id: inv.id,
          linkedAxisId: inv.linkedAxisId,
          linkedDisplayName: inv.linkedDisplayName,
          linkedUserId: inv.linkedUserId,
          assignedPropertyIds: draft?.assignedPropertyIds ?? inv.assignedPropertyIds,
          propertyCoManagerPermissions:
            draft?.propertyCoManagerPermissions ?? inv.propertyCoManagerPermissions ?? {},
        };
      });
  }

  return localRows
    .filter((row) => row.linkDirection !== "incoming")
    .map((row) => ({
      id: row.id,
      linkedAxisId: row.linkedAxisId,
      linkedDisplayName: row.linkedDisplayName,
      linkedUserId: row.linkedUserId,
      assignedPropertyIds: row.assignedPropertyIds,
      propertyCoManagerPermissions: row.propertyCoManagerPermissions ?? {},
    }));
}

export function listOutgoingCoManagersForProperty(
  propertyId: string,
  links: CoManagerPropertyLink[],
): CoManagerPropertyLink[] {
  return links.filter((link) => propertyIdInAssignedList(propertyId, link.assignedPropertyIds));
}
