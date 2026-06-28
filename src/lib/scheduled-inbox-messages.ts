import type { SupabaseClient } from "@supabase/supabase-js";

export type ScheduledInboxMessageStatus = "scheduled" | "sent" | "cancelled";

export function isUpcomingScheduledInboxMessage(sendAt: string, status: string): boolean {
  if (status === "sent") return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return new Date(sendAt).getTime() >= startOfToday.getTime();
}

export type ScheduledInboxMessageRecord = {
  id: string;
  managerUserId: string;
  sendAt: string;
  status: ScheduledInboxMessageStatus;
  subject: string;
  body: string;
  recipientEmail: string;
  recipientName: string;
  recipientUserId?: string | null;
  broadcastCategories?: ("management" | "resident")[];
  deliverViaEmail: boolean;
  deliverViaSms: boolean;
  createdAt: string;
  sentAt?: string | null;
  cancelledAt?: string | null;
};

function rowFromDb(row: {
  id: string;
  manager_user_id: string;
  send_at: string;
  status: string;
  row_data: unknown;
  created_at: string;
}): ScheduledInboxMessageRecord {
  const data = (row.row_data ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    managerUserId: row.manager_user_id,
    sendAt: row.send_at,
    status: (row.status as ScheduledInboxMessageStatus) ?? "scheduled",
    subject: String(data.subject ?? ""),
    body: String(data.body ?? ""),
    recipientEmail: String(data.recipientEmail ?? "").trim().toLowerCase(),
    recipientName: String(data.recipientName ?? "").trim() || String(data.recipientEmail ?? ""),
    recipientUserId: typeof data.recipientUserId === "string" ? data.recipientUserId : null,
    broadcastCategories: Array.isArray(data.broadcastCategories)
      ? data.broadcastCategories.filter((c): c is "management" | "resident" => c === "management" || c === "resident")
      : undefined,
    deliverViaEmail: data.deliverViaEmail !== false,
    deliverViaSms: data.deliverViaSms === true,
    createdAt: row.created_at,
    sentAt: typeof data.sentAt === "string" ? data.sentAt : null,
    cancelledAt: typeof data.cancelledAt === "string" ? data.cancelledAt : null,
  };
}

export function generateScheduledInboxMessageId(): string {
  return `sched_inbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadScheduledInboxMessagesForManager(
  db: SupabaseClient,
  managerUserId: string,
): Promise<ScheduledInboxMessageRecord[]> {
  const { data, error } = await db
    .from("portal_scheduled_inbox_message_records")
    .select("id, manager_user_id, send_at, status, row_data, created_at")
    .eq("manager_user_id", managerUserId)
    .order("send_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) =>
    rowFromDb(row as { id: string; manager_user_id: string; send_at: string; status: string; row_data: unknown; created_at: string }),
  );
}

export async function loadDueScheduledInboxMessages(
  db: SupabaseClient,
  now = new Date(),
): Promise<ScheduledInboxMessageRecord[]> {
  const { data, error } = await db
    .from("portal_scheduled_inbox_message_records")
    .select("id, manager_user_id, send_at, status, row_data, created_at")
    .eq("status", "scheduled")
    .lte("send_at", now.toISOString())
    .order("send_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) =>
    rowFromDb(row as { id: string; manager_user_id: string; send_at: string; status: string; row_data: unknown; created_at: string }),
  );
}

export async function createScheduledInboxMessage(
  db: SupabaseClient,
  input: Omit<ScheduledInboxMessageRecord, "createdAt" | "sentAt" | "cancelledAt">,
): Promise<ScheduledInboxMessageRecord> {
  const now = new Date().toISOString();
  const rowData = {
    subject: input.subject,
    body: input.body,
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName,
    recipientUserId: input.recipientUserId ?? null,
    broadcastCategories: input.broadcastCategories ?? [],
    deliverViaEmail: input.deliverViaEmail,
    deliverViaSms: input.deliverViaSms,
  };
  const { error } = await db.from("portal_scheduled_inbox_message_records").insert({
    id: input.id,
    manager_user_id: input.managerUserId,
    send_at: input.sendAt,
    status: input.status,
    row_data: rowData,
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;
  return { ...input, createdAt: now, sentAt: null, cancelledAt: null };
}

export async function updateScheduledInboxMessage(
  db: SupabaseClient,
  managerUserId: string,
  id: string,
  patch: Partial<
    Pick<
      ScheduledInboxMessageRecord,
      "sendAt" | "status" | "subject" | "body" | "recipientEmail" | "recipientName" | "recipientUserId" | "deliverViaEmail" | "deliverViaSms"
    >
  > & { sentAt?: string | null; cancelledAt?: string | null },
): Promise<void> {
  const { data: existing } = await db
    .from("portal_scheduled_inbox_message_records")
    .select("row_data, status")
    .eq("id", id)
    .eq("manager_user_id", managerUserId)
    .maybeSingle();
  if (!existing) throw new Error("Scheduled message not found.");

  const prev = (existing.row_data ?? {}) as Record<string, unknown>;
  const nextData = {
    ...prev,
    ...(patch.subject != null ? { subject: patch.subject } : {}),
    ...(patch.body != null ? { body: patch.body } : {}),
    ...(patch.recipientEmail != null ? { recipientEmail: patch.recipientEmail.trim().toLowerCase() } : {}),
    ...(patch.recipientName != null ? { recipientName: patch.recipientName } : {}),
    ...(patch.recipientUserId !== undefined ? { recipientUserId: patch.recipientUserId } : {}),
    ...(patch.deliverViaEmail != null ? { deliverViaEmail: patch.deliverViaEmail } : {}),
    ...(patch.deliverViaSms != null ? { deliverViaSms: patch.deliverViaSms } : {}),
    ...(patch.sentAt !== undefined ? { sentAt: patch.sentAt } : {}),
    ...(patch.cancelledAt !== undefined ? { cancelledAt: patch.cancelledAt } : {}),
  };

  const { error } = await db
    .from("portal_scheduled_inbox_message_records")
    .update({
      ...(patch.sendAt != null ? { send_at: patch.sendAt } : {}),
      ...(patch.status != null ? { status: patch.status } : {}),
      row_data: nextData,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("manager_user_id", managerUserId);
  if (error) throw error;
}

export type InboxScheduleRow = {
  id: string;
  source: "manual" | "automation";
  sendAt: string;
  recipientName: string;
  recipientEmail: string;
  topic: string;
  subject: string;
  body: string;
  status: ScheduledInboxMessageStatus | "sent" | "cancelled" | "scheduled";
  timingLabel: string;
  propertyLabel?: string;
  manualId?: string;
  automationId?: string;
};
