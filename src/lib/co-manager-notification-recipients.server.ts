import "server-only";

import { asStringArray, readPropertyPermissionsFromRow } from "@/app/api/pro/account-links/route";
import {
  hasCoManagerPermissionForProperty,
  type CoManagerPermissionId,
} from "@/lib/co-manager-permissions";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type CoManagerNotificationChannel = "inbox" | "calendar";

function channelPermission(channel: CoManagerNotificationChannel): CoManagerPermissionId {
  return channel;
}

/**
 * Primary manager plus co-managers who have inbox/calendar access on a property.
 * When `propertyId` is omitted, returns only the owner (manager-specific notifications).
 */
export async function resolvePropertyScopedManagerRecipientIds(
  db: ServiceClient,
  input: {
    ownerManagerUserId: string;
    propertyId?: string | null;
    channel: CoManagerNotificationChannel;
  },
): Promise<string[]> {
  const ownerId = input.ownerManagerUserId.trim();
  if (!ownerId) return [];

  const propertyId = input.propertyId?.trim() || "";
  const recipientIds = new Set<string>([ownerId]);
  if (!propertyId) return [...recipientIds];

  try {
    const { data: links, error } = await db
      .from("account_link_invites")
      .select(
        "invitee_user_id, assigned_property_ids, property_co_manager_permissions, co_manager_permissions",
      )
      .eq("status", "accepted")
      .eq("inviter_user_id", ownerId);

    if (error && !String(error.message ?? "").toLowerCase().includes("account_link_invites")) {
      return [...recipientIds];
    }

    const permission = channelPermission(input.channel);
    for (const row of links ?? []) {
      const inviteeId = String(row.invitee_user_id ?? "").trim();
      if (!inviteeId) continue;
      const assigned = asStringArray(row.assigned_property_ids);
      if (!assigned.includes(propertyId)) continue;
      const perms = readPropertyPermissionsFromRow(
        row as Parameters<typeof readPropertyPermissionsFromRow>[0],
      );
      if (!hasCoManagerPermissionForProperty(perms, propertyId, permission)) continue;
      recipientIds.add(inviteeId);
    }
  } catch {
    /* table may not exist */
  }

  return [...recipientIds];
}

/** Resolve manager profile emails for inbox/email delivery fan-out. */
export async function resolveManagerRecipientProfiles(
  db: ServiceClient,
  userIds: string[],
): Promise<Array<{ userId: string; email: string; fullName: string | null }>> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data } = await db.from("profiles").select("id, email, full_name").in("id", ids);
  const out: Array<{ userId: string; email: string; fullName: string | null }> = [];
  for (const row of data ?? []) {
    const userId = String(row.id ?? "").trim();
    const email = String(row.email ?? "").trim().toLowerCase();
    if (!userId || !email.includes("@")) continue;
    out.push({
      userId,
      email,
      fullName: String(row.full_name ?? "").trim() || null,
    });
  }
  return out;
}
