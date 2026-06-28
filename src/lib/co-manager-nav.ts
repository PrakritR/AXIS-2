import type { AccountLinkInviteDto } from "@/lib/account-links";
import {
  type CoManagerPermissions,
  mergeCoManagerPermissionsFromPropertyRows,
} from "@/lib/co-manager-permissions";

export type ManagerNavRole = {
  isPrimaryManager: boolean;
  mergedPermissions: CoManagerPermissions;
};

/** Derive portal nav role from accepted account-link invite directions. */
export function deriveManagerNavRole(
  invites: Pick<AccountLinkInviteDto, "direction" | "status" | "coManagerPermissions" | "propertyCoManagerPermissions">[],
): ManagerNavRole {
  const accepted = invites.filter((inv) => inv.status === "accepted");
  const hasOutgoing = accepted.some((inv) => inv.direction === "outgoing");
  const incoming = accepted.filter((inv) => inv.direction === "incoming");

  const isPrimaryManager = hasOutgoing || incoming.length === 0;
  const mergedPermissions = isPrimaryManager
    ? {}
    : mergeCoManagerPermissionsFromPropertyRows(
        incoming.map((inv) => ({
          propertyCoManagerPermissions: inv.propertyCoManagerPermissions,
          coManagerPermissions: inv.coManagerPermissions,
        })),
      );

  return { isPrimaryManager, mergedPermissions };
}
