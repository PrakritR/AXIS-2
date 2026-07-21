import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { residentSmsLinkOrigin } from "@/lib/claw-resident-links";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import type { NotificationCategory } from "@/lib/notification-preferences";

export type WorkOrderSmsEvent =
  | "created"
  | "vendor_marked_done"
  | "completed"
  | "approved_paid"
  | "reminder";

export type ResidentFiledItemKind = "work-order" | "service-request";

function workOrderSmsBody(
  event: WorkOrderSmsEvent,
  input: {
    title: string;
    propertyLabel?: string;
    note?: string;
    actorName?: string;
    audience?: "manager" | "resident";
    itemKind?: ResidentFiledItemKind;
  },
): string {
  const title = input.title.trim() || "Work order";
  const at = input.propertyLabel?.trim() ? ` at ${input.propertyLabel.trim()}` : "";
  switch (event) {
    case "created": {
      if (input.audience === "manager") {
        const kindLabel = input.itemKind === "service-request" ? "Add-on service" : "Work order";
        const reviewPath =
          input.itemKind === "service-request"
            ? "/portal/services/requests"
            : "/portal/services/work-orders";
        return [
          `(New ${kindLabel.toLowerCase()}) "${title}"${at}`,
          `Review: ${residentSmsLinkOrigin()}${reviewPath}`,
        ].join("\n");
      }
      return `(Maintenance request received)\n"${title}"${at}. We'll keep you updated.`;
    }
    case "vendor_marked_done":
      return `(Work order update)\n"${title}"${at} marked done${input.note ? `: ${input.note.slice(0, 120)}` : ""}. Review in Work Orders.`;
    case "completed":
      return `(Work order completed)\n"${title}"${at} is done.`;
    case "approved_paid":
      return `(Work order paid)\n"${title}"${at} approved and paid. Thanks for the work.`;
    case "reminder":
      return `(Reminder)\nPending work order "${title}"${at} needs attention.`;
    default:
      return `(Update)\n"${title}"${at} update from PropLane.`;
  }
}

/** Best-effort SMS + inbox delivery for work-order lifecycle events. */
export async function notifyWorkOrderEvent(
  db: SupabaseClient,
  input: {
    event: WorkOrderSmsEvent;
    senderUserId: string;
    senderEmail: string;
    senderName?: string;
    subject: string;
    text: string;
    title: string;
    propertyLabel?: string;
    note?: string;
    toEmails?: string[];
    toUserIds?: string[];
    /** Notification category — defaults to 'maintenance'. Email/SMS follow hard delivery gates. */
    eventCategory?: NotificationCategory;
    audience?: "manager" | "resident";
    itemKind?: ResidentFiledItemKind;
  },
): Promise<void> {
  const smsText = workOrderSmsBody(input.event, {
    title: input.title,
    propertyLabel: input.propertyLabel,
    note: input.note,
    actorName: input.senderName,
    audience: input.audience,
    itemKind: input.itemKind,
  });

  await deliverPortalInboxMessage(db, {
    senderUserId: input.senderUserId,
    senderEmail: input.senderEmail,
    fromName: input.senderName?.trim() || "PropLane Portal",
    subject: input.subject,
    text: input.text,
    toEmails: input.toEmails,
    toUserIds: input.toUserIds,
    eventCategory: input.eventCategory ?? "maintenance",
    smsText,
  }).catch(() => undefined);
}

/**
 * Resident filed a work order or add-on service request → manager gets Axis inbox,
 * email, and SMS (when the manager has a phone on file).
 */
export async function notifyManagerOfResidentFiledItem(
  db: SupabaseClient,
  input: {
    kind: ResidentFiledItemKind;
    senderUserId: string;
    senderEmail: string;
    senderName?: string;
    managerUserId: string;
    title: string;
    description?: string;
    propertyLabel?: string;
  },
): Promise<void> {
  const managerUserId = input.managerUserId.trim();
  if (!managerUserId) return;

  const kindLabel = input.kind === "service-request" ? "add-on service" : "work order";
  const title = input.title.trim() || (input.kind === "service-request" ? "Add-on service" : "Work order");
  const description =
    input.description?.trim() ||
    `A resident submitted a new ${kindLabel}: "${title}"${
      input.propertyLabel?.trim() ? ` at ${input.propertyLabel.trim()}` : ""
    }.`;

  await notifyWorkOrderEvent(db, {
    event: "created",
    senderUserId: input.senderUserId,
    senderEmail: input.senderEmail,
    senderName: input.senderName,
    subject: `New resident ${kindLabel}: ${title}`,
    text: description,
    title,
    propertyLabel: input.propertyLabel,
    toUserIds: [managerUserId],
    audience: "manager",
    itemKind: input.kind,
  });
}
