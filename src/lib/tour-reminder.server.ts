import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRangeLabel } from "@/lib/tour-inquiry-confirm.server";
import {
  loadManagerAutomationSettings,
  type ManagerAutomationSettings,
} from "@/lib/payment-automation-settings";
import {
  createScheduledInboxMessage,
  generateScheduledInboxMessageId,
  type ScheduledInboxMessageRecord,
  updateScheduledInboxMessage,
} from "@/lib/scheduled-inbox-messages";
import {
  DEFAULT_TOUR_REMINDER_TEMPLATE,
  fillTourReminderTemplate,
  TOUR_REMINDER_MESSAGE_KIND,
  tourReminderSendAtIso,
  type TourReminderTemplateContext,
} from "@/lib/tour-reminder";

type Db = SupabaseClient;

function rowData(record: ScheduledInboxMessageRecord): Record<string, unknown> {
  return {
    subject: record.subject,
    body: record.body,
    recipientEmail: record.recipientEmail,
    recipientName: record.recipientName,
    recipientUserId: record.recipientUserId ?? null,
    deliverViaEmail: record.deliverViaEmail,
    deliverViaSms: record.deliverViaSms,
    messageKind: record.messageKind,
    tourPlannedEventId: record.tourPlannedEventId,
    tourStartIso: record.tourStartIso,
    senderPortal: "manager",
  };
}

function parseTourReminderRow(row: {
  id: string;
  manager_user_id: string;
  send_at: string;
  status: string;
  row_data: unknown;
  created_at: string;
}): ScheduledInboxMessageRecord | null {
  const data = (row.row_data ?? {}) as Record<string, unknown>;
  if (data.messageKind !== TOUR_REMINDER_MESSAGE_KIND) return null;
  return {
    id: row.id,
    managerUserId: row.manager_user_id,
    sendAt: row.send_at,
    status: row.status as ScheduledInboxMessageRecord["status"],
    subject: String(data.subject ?? ""),
    body: String(data.body ?? ""),
    recipientEmail: String(data.recipientEmail ?? "").trim().toLowerCase(),
    recipientName: String(data.recipientName ?? "").trim(),
    recipientUserId: typeof data.recipientUserId === "string" ? data.recipientUserId : null,
    deliverViaEmail: data.deliverViaEmail !== false,
    deliverViaSms: data.deliverViaSms === true,
    messageKind: TOUR_REMINDER_MESSAGE_KIND,
    tourPlannedEventId: typeof data.tourPlannedEventId === "string" ? data.tourPlannedEventId : undefined,
    tourStartIso: typeof data.tourStartIso === "string" ? data.tourStartIso : undefined,
    createdAt: row.created_at,
    sentAt: typeof data.sentAt === "string" ? data.sentAt : null,
    cancelledAt: typeof data.cancelledAt === "string" ? data.cancelledAt : null,
  };
}

export async function findTourReminderForPlannedEvent(
  db: Db,
  managerUserId: string,
  plannedEventId: string,
): Promise<ScheduledInboxMessageRecord | null> {
  const { data, error } = await db
    .from("portal_scheduled_inbox_message_records")
    .select("id, manager_user_id, send_at, status, row_data, created_at")
    .eq("manager_user_id", managerUserId)
    .eq("row_data->>messageKind", TOUR_REMINDER_MESSAGE_KIND)
    .eq("row_data->>tourPlannedEventId", plannedEventId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  for (const row of data ?? []) {
    const parsed = parseTourReminderRow(
      row as { id: string; manager_user_id: string; send_at: string; status: string; row_data: unknown; created_at: string },
    );
    if (parsed && parsed.status !== "cancelled") return parsed;
  }
  return null;
}

export async function cancelTourReminderForPlannedEvent(
  db: Db,
  managerUserId: string,
  plannedEventId: string,
): Promise<void> {
  const existing = await findTourReminderForPlannedEvent(db, managerUserId, plannedEventId);
  if (!existing || existing.status !== "scheduled") return;
  await updateScheduledInboxMessage(db, managerUserId, existing.id, {
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  });
}

export type UpsertTourReminderInput = {
  managerUserId: string;
  plannedEventId: string;
  tourStartIso: string;
  tourEndIso: string;
  recipientEmail: string;
  recipientName: string;
  propertyTitle?: string;
  instructions?: string;
  managerName: string;
  settings?: ManagerAutomationSettings;
  subject?: string;
  body?: string;
  sendAt?: string;
  deliverViaEmail?: boolean;
  deliverViaSms?: boolean;
};

export async function upsertTourReminderForPlannedEvent(
  db: Db,
  input: UpsertTourReminderInput,
): Promise<ScheduledInboxMessageRecord | null> {
  const settings = input.settings ?? (await loadManagerAutomationSettings(db, input.managerUserId));
  if (settings.tourReminderEnabled === false) {
    await cancelTourReminderForPlannedEvent(db, input.managerUserId, input.plannedEventId);
    return null;
  }

  const email = input.recipientEmail.trim().toLowerCase();
  if (!email.includes("@")) return null;

  const ctx: TourReminderTemplateContext = {
    guestName: input.recipientName.trim() || "Guest",
    propertyTitle: input.propertyTitle?.trim() ?? "",
    tourTime: formatRangeLabel(input.tourStartIso, input.tourEndIso),
    managerName: input.managerName.trim() || "Your property manager",
    instructions: input.instructions?.trim() ?? "",
  };
  const templated = fillTourReminderTemplate(settings.templates.tourReminder ?? DEFAULT_TOUR_REMINDER_TEMPLATE, ctx);
  const subject = input.subject?.trim() || templated.subject;
  const body = input.body?.trim() || templated.body;
  const sendAt =
    input.sendAt?.trim() ||
    tourReminderSendAtIso(input.tourStartIso, settings.tourReminderMinutesBefore) ||
    null;
  if (!sendAt) {
    await cancelTourReminderForPlannedEvent(db, input.managerUserId, input.plannedEventId);
    return null;
  }

  const deliverViaEmail = input.deliverViaEmail ?? settings.tourReminderDeliverViaEmail !== false;
  const deliverViaSms = input.deliverViaSms ?? settings.tourReminderDeliverViaSms === true;
  const existing = await findTourReminderForPlannedEvent(db, input.managerUserId, input.plannedEventId);

  if (existing?.status === "sent") return existing;

  if (existing) {
    await updateScheduledInboxMessage(db, input.managerUserId, existing.id, {
      sendAt,
      subject,
      body,
      recipientEmail: email,
      recipientName: input.recipientName.trim() || email,
      deliverViaEmail,
      deliverViaSms,
    });
    return { ...existing, sendAt, subject, body, recipientEmail: email, deliverViaEmail, deliverViaSms, tourStartIso: input.tourStartIso };
  }

  const id = generateScheduledInboxMessageId();
  return createScheduledInboxMessage(db, {
    id,
    managerUserId: input.managerUserId,
    sendAt,
    status: "scheduled",
    subject,
    body,
    recipientEmail: email,
    recipientName: input.recipientName.trim() || email,
    deliverViaEmail,
    deliverViaSms,
    messageKind: TOUR_REMINDER_MESSAGE_KIND,
    tourPlannedEventId: input.plannedEventId,
    tourStartIso: input.tourStartIso,
  });
}

export async function scheduleTourReminderAfterConfirm(
  db: Db,
  input: {
    managerUserId: string;
    plannedEvent: Record<string, unknown>;
    inquiryRow: Record<string, unknown>;
    managerName: string;
  },
): Promise<ScheduledInboxMessageRecord | null> {
  const plannedEventId = String(input.plannedEvent.id ?? "").trim();
  const start = String(input.plannedEvent.start ?? "").trim();
  const end = String(input.plannedEvent.end ?? "").trim();
  const email = String(input.plannedEvent.attendeeEmail ?? input.inquiryRow.email ?? "").trim();
  const name = String(input.plannedEvent.attendeeName ?? input.inquiryRow.name ?? "").trim();
  if (!plannedEventId || !start || !end || !email) return null;

  return upsertTourReminderForPlannedEvent(db, {
    managerUserId: input.managerUserId,
    plannedEventId,
    tourStartIso: start,
    tourEndIso: end,
    recipientEmail: email,
    recipientName: name,
    propertyTitle: String(input.plannedEvent.propertyTitle ?? input.inquiryRow.propertyTitle ?? "").trim() || undefined,
    instructions: String(input.plannedEvent.instructions ?? input.inquiryRow.instructions ?? "").trim() || undefined,
    managerName: input.managerName,
  });
}
