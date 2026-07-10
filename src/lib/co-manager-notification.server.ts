/**
 * Email + Axis inbox notifications for co-manager invites and ownership transfers.
 */

import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import { resolveEmailLinkBaseUrl } from "@/lib/app-url";

type Db = ReturnType<typeof createSupabaseServiceRoleClient>;

function appOrigin(): string {
  return resolveEmailLinkBaseUrl();
}

async function profileEmail(db: Db, userId: string): Promise<{ email: string; name: string } | null> {
  const { data } = await db.from("profiles").select("email, full_name").eq("id", userId).maybeSingle();
  const email = String(data?.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  const name = String(data?.full_name ?? "").trim() || email;
  return { email, name };
}

export async function notifyCoManagerInviteSent(input: {
  inviterUserId: string;
  inviteeUserId: string;
  inviterName: string;
  propertyLabels: string[];
}): Promise<void> {
  const db = (await import("@/lib/supabase/service")).createSupabaseServiceRoleClient();
  const invitee = await profileEmail(db, input.inviteeUserId);
  const inviter = await profileEmail(db, input.inviterUserId);
  if (!invitee) return;

  const properties =
    input.propertyLabels.length > 0
      ? input.propertyLabels.join(", ")
      : "assigned properties";
  const subject = `${input.inviterName} invited you as a co-manager`;
  const text = [
    `${input.inviterName} invited you to co-manage properties on Axis.`,
    "",
    `Properties: ${properties}`,
    "",
    `Open your portal to review and approve the link: ${appOrigin()}/manager/relationships`,
    "",
    "— Axis",
  ].join("\n");

  await deliverPortalInboxMessage(db, {
    senderUserId: input.inviterUserId,
    senderEmail: inviter?.email ?? "noreply@axis.local",
    fromName: input.inviterName,
    subject,
    text,
    toEmails: [invitee.email],
    toUserIds: [input.inviteeUserId],
    deliverToPortalInbox: true,
    deliverViaEmail: true,
  });
}

export async function notifyCoManagerInviteAccepted(input: {
  inviterUserId: string;
  inviteeUserId: string;
  inviteeName: string;
}): Promise<void> {
  const db = (await import("@/lib/supabase/service")).createSupabaseServiceRoleClient();
  const inviter = await profileEmail(db, input.inviterUserId);
  const invitee = await profileEmail(db, input.inviteeUserId);
  if (!inviter) return;

  const subject = `${input.inviteeName} accepted your co-manager invite`;
  const text = [
    `${input.inviteeName} accepted your co-manager link on Axis.`,
    "",
    `Manage permissions in Co-managers: ${appOrigin()}/manager/relationships`,
    "",
    "— Axis",
  ].join("\n");

  await deliverPortalInboxMessage(db, {
    senderUserId: input.inviteeUserId,
    senderEmail: invitee?.email ?? "noreply@axis.local",
    fromName: input.inviteeName,
    subject,
    text,
    toEmails: [inviter.email],
    toUserIds: [input.inviterUserId],
    deliverToPortalInbox: true,
    deliverViaEmail: true,
  });
}

export async function notifyPromotedToMainManager(input: {
  newManagerUserId: string;
  formerOwnerUserId: string;
  formerOwnerName: string;
  propertyLabel: string;
}): Promise<void> {
  const db = (await import("@/lib/supabase/service")).createSupabaseServiceRoleClient();
  const newManager = await profileEmail(db, input.newManagerUserId);
  const formerOwner = await profileEmail(db, input.formerOwnerUserId);
  if (!newManager) return;

  const subject = `You are now the main manager of ${input.propertyLabel}`;
  const text = [
    `${input.formerOwnerName} transferred ownership of ${input.propertyLabel} to you on Axis.`,
    "",
    "You are now the main manager for this property. The former owner remains a co-manager with the permissions they chose.",
    "",
    `Open your portal: ${appOrigin()}/manager/properties`,
    "",
    "— Axis",
  ].join("\n");

  await deliverPortalInboxMessage(db, {
    senderUserId: input.formerOwnerUserId,
    senderEmail: formerOwner?.email ?? "noreply@axis.local",
    fromName: input.formerOwnerName,
    subject,
    text,
    toEmails: [newManager.email],
    toUserIds: [input.newManagerUserId],
    deliverToPortalInbox: true,
    deliverViaEmail: true,
  });
}

export async function notifyDemotedToCoManager(input: {
  formerOwnerUserId: string;
  newManagerUserId: string;
  newManagerName: string;
  propertyLabel: string;
}): Promise<void> {
  const db = (await import("@/lib/supabase/service")).createSupabaseServiceRoleClient();
  const formerOwner = await profileEmail(db, input.formerOwnerUserId);
  const newManager = await profileEmail(db, input.newManagerUserId);
  if (!formerOwner) return;

  const subject = `Ownership transferred — ${input.propertyLabel}`;
  const text = [
    `You transferred main manager ownership of ${input.propertyLabel} to ${input.newManagerName}.`,
    "",
    "You remain a co-manager on this property with the permissions you selected.",
    "",
    `Manage your team: ${appOrigin()}/manager/relationships`,
    "",
    "— Axis",
  ].join("\n");

  await deliverPortalInboxMessage(db, {
    senderUserId: input.newManagerUserId,
    senderEmail: newManager?.email ?? "noreply@axis.local",
    fromName: input.newManagerName,
    subject,
    text,
    toEmails: [formerOwner.email],
    toUserIds: [input.formerOwnerUserId],
    deliverToPortalInbox: true,
    deliverViaEmail: true,
  });
}
