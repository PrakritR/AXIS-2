import type { AccountLinkInviteDto } from "@/lib/account-links";
import {
  type CoManagerPermissions,
  mergeCoManagerPermissionsFromPropertyRows,
} from "@/lib/co-manager-permissions";

export type ManagerNavRole = {
  isPrimaryManager: boolean;
  mergedPermissions: CoManagerPermissions;
  /**
   * True when the user is a co-manager with ≥1 accepted incoming link but no
   * explicit module restrictions (merged permissions empty). Threaded into
   * `coManagerPortalSectionAllowed` so nav visibility matches the data layer's
   * empty-permissions = full-access rule.
   */
  hasEmptyPermissionCoManagerLink: boolean;
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

  // A co-manager reaches this branch only with ≥1 accepted incoming link
  // (isPrimaryManager is true when there are none). If the merged set is empty,
  // nothing was explicitly restricted, so default to full module nav.
  const hasEmptyPermissionCoManagerLink =
    !isPrimaryManager && Object.keys(mergedPermissions).length === 0;

  return { isPrimaryManager, mergedPermissions, hasEmptyPermissionCoManagerLink };
}
