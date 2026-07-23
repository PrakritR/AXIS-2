import {
  isUpcomingScheduledInboxMessage,
  isResidentOriginatedScheduledMessage,
  type ScheduledInboxMessageRecord,
} from "@/lib/scheduled-inbox-messages";
import {
  formatScheduledSendAt,
  type ScheduledPaymentMessage,
} from "@/lib/scheduled-payment-messages";

/**
 * A scheduled / automated message surfaced INLINE inside a person's
 * conversation thread (marked "Scheduled · sends <when>"), replacing the old
 * standalone Schedule table. The manager sees past + pending + scheduled
 * communication with one person in one place.
 */
export type ThreadScheduledItem = {
  id: string;
  source: "manual" | "automation";
  sendAt: string;
  /** Human "sends <when>" label. */
  sendLabel: string;
  subject: string;
  body: string;
  /** Short context line (automation charge title / property; manual is generic). */
  meta?: string;
  /**
   * Whether the MANAGER may edit this row's content inline. False for
   * resident-originated manual rows (managers may cancel but not rewrite them,
   * mirroring `updateScheduledInboxMessage`'s server-side guard). Automation and
   * manager-authored manual rows are editable.
   */
  editable: boolean;
  /**
   * Channel the message will send on. Email today; the field exists so an SMS /
   * WhatsApp / Gmail scheduled item tags into the SAME person-thread once those
   * channels come online, rather than a parallel list.
   */
  channel: "email" | "sms";
};

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Upcoming, still-scheduled messages addressed to `recipientEmail`, newest send
 * last, ready to render as inline "Scheduled" cards in that person's thread.
 * Cancelled/sent rows are dropped (the thread shows what is *pending*), matching
 * the Schedule table's `isUpcomingScheduledInboxMessage` gate. Pure + testable.
 */
export function scheduledItemsForRecipient(
  recipientEmail: string,
  manual: ScheduledInboxMessageRecord[],
  automation: ScheduledPaymentMessage[],
): ThreadScheduledItem[] {
  const target = normalizeEmail(recipientEmail);
  if (!target) return [];

  const items: ThreadScheduledItem[] = [];

  for (const message of manual) {
    if (message.status !== "scheduled") continue;
    if (!isUpcomingScheduledInboxMessage(message.sendAt, message.status)) continue;
    if (normalizeEmail(message.recipientEmail) !== target) continue;
    items.push({
      id: message.id,
      source: "manual",
      sendAt: message.sendAt,
      sendLabel: formatScheduledSendAt(message.sendAt),
      subject: message.subject,
      body: message.body,
      editable: !isResidentOriginatedScheduledMessage(message),
      channel: message.deliverViaSms && !message.deliverViaEmail ? "sms" : "email",
    });
  }

  for (const message of automation) {
    if (message.status !== "scheduled") continue;
    if (!isUpcomingScheduledInboxMessage(message.sendAt, message.status)) continue;
    if (normalizeEmail(message.residentEmail) !== target) continue;
    items.push({
      id: message.id,
      source: "automation",
      sendAt: message.sendAt,
      sendLabel: formatScheduledSendAt(message.sendAt),
      subject: message.subject,
      body: message.body,
      meta: [message.chargeTitle, message.propertyLabel].filter(Boolean).join(" · ") || undefined,
      editable: true,
      channel: "email",
    });
  }

  return items.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}
