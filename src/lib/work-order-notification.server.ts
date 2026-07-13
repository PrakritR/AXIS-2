import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import type { NotificationCategory } from "@/lib/notification-preferences";

export type WorkOrderSmsEvent =
  | "created"
  | "vendor_marked_done"
  | "completed"
  | "approved_paid"
  | "reminder";

function workOrderSmsBody(
  event: WorkOrderSmsEvent,
  input: { title: string; propertyLabel?: string; note?: string; actorName?: string },
): string {
  const title = input.title.trim() || "Work order";
  const at = input.propertyLabel?.trim() ? ` at ${input.propertyLabel.trim()}` : "";
  switch (event) {
    case "created":
      return `New maintenance request: "${title}"${at}. We'll keep you updated.`;
    case "vendor_marked_done":
      return `"${title}"${at} marked done${input.note ? `: ${input.note.slice(0, 120)}` : ""}. Review in Work Orders.`;
    case "completed":
      return `Your work order "${title}"${at} has been completed.`;
    case "approved_paid":
      return `"${title}"${at} approved and paid. Thanks for the work.`;
    case "reminder":
      return `Reminder: pending work order "${title}"${at} needs attention.`;
    default:
      return `"${title}"${at} update from PropLane.`;
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
    /** Notification category — defaults to 'maintenance'. Email/SMS now follow the recipient's per-category preference. */
    eventCategory?: NotificationCategory;
  },
): Promise<void> {
  const smsText = workOrderSmsBody(input.event, {
    title: input.title,
    propertyLabel: input.propertyLabel,
    note: input.note,
    actorName: input.senderName,
  });

  await deliverPortalInboxMessage(db, {
    senderUserId: input.senderUserId,
    senderEmail: input.senderEmail,
    fromName: input.senderName?.trim() || "PropLane Portal",
    subject: input.subject,
    text: input.text,
    toEmails: input.toEmails,
    toUserIds: input.toUserIds,
    // Category-driven: inbox always on; email + SMS gated per recipient's
    // maintenance preference (default email ON, SMS opt-in) with a verified phone.
    eventCategory: input.eventCategory ?? "maintenance",
    smsText,
  }).catch(() => undefined);
}
