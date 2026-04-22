/** Shared types for `/api/pro/account-links` (server + client). */

export type AccountLinkTabKind = "owner" | "manager";

export type AccountLinkInviteStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type AccountLinkInviteDto = {
  id: string;
  tabKind: AccountLinkTabKind;
  status: AccountLinkInviteStatus;
  direction: "outgoing" | "incoming";
  inviterAxisId: string;
  inviteeAxisId: string;
  inviterDisplayName: string | null;
  inviteeDisplayName: string | null;
  /** For the signed-in user: the other workspace’s Axis ID and label. */
  linkedAxisId: string;
  linkedDisplayName: string | null;
  assignedPropertyIds: string[];
  payoutPercentForManager: number;
  createdAt: string;
  respondedAt: string | null;
};

export type AccountLinksPayload = {
  migrationRequired?: boolean;
  invites: AccountLinkInviteDto[];
};

export function looksLikeAccountLinksMissingTable(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("account_link_invites") &&
    (m.includes("does not exist") || m.includes("schema cache") || m.includes("relation"))
  );
}
