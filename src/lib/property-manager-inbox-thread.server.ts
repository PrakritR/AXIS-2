/**
 * One Communication thread per (resident/prospect email, manager, property).
 */
import { formatPacificDateTime } from "@/lib/pacific-time";

const RESIDENT_INBOX_SCOPE = "axis_portal_inbox_resident_v1";
const MANAGER_INBOX_SCOPE = "axis_portal_inbox_manager_v1";

type Db = ReturnType<typeof import("@/lib/supabase/service").createSupabaseServiceRoleClient>;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function fnv1aHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function propertyManagerConversationThreadId(input: {
  residentEmail: string;
  managerUserId: string;
  propertyId: string;
}): string {
  const key = [
    input.residentEmail.trim().toLowerCase(),
    input.managerUserId.trim(),
    input.propertyId.trim(),
  ].join("\0");
  return `property_mgr_${fnv1aHash(key)}`;
}

export function propertyManagerThreadLabel(propertyTitle: string): string {
  const title = propertyTitle.trim() || "Property";
  return `Property manager (${title})`;
}

type ThreadMessage = {
  id: string;
  from: string;
  body: string;
  at: string;
  outbound?: boolean;
};

function appendThreadMessages(
  rowData: Record<string, unknown>,
  turns: ThreadMessage[],
): ThreadMessage[] {
  const messages = Array.isArray(rowData.messages)
    ? [...(rowData.messages as ThreadMessage[])]
    : [];
  messages.push(...turns);
  return messages;
}

/** Resident-side thread for messages about one listing with one manager. */
export async function appendResidentPropertyManagerInboxMessage(
  db: Db,
  input: {
    participantEmail: string;
    managerUserId: string;
    propertyId: string;
    propertyTitle: string;
    subject: string;
    body: string;
    residentMessage?: string;
    residentName?: string;
    counterpartyEmail?: string;
    fromName?: string;
  },
): Promise<void> {
  const guestEmail = input.participantEmail.trim().toLowerCase();
  if (!guestEmail.includes("@")) return;

  const { data: guestProfile } = await db.from("profiles").select("id").eq("email", guestEmail).maybeSingle();
  const ownerUserId = (guestProfile?.id as string | null) ?? null;
  const threadId = propertyManagerConversationThreadId({
    residentEmail: guestEmail,
    managerUserId: input.managerUserId,
    propertyId: input.propertyId,
  });
  const when = formatPacificDateTime(new Date());
  const displayFrom = propertyManagerThreadLabel(input.propertyTitle);
  const counterpartyEmail = input.counterpartyEmail?.trim().toLowerCase() || "";
  const ackFrom = input.fromName ?? "PropLane";
  const residentMessage = input.residentMessage?.trim() ?? "";
  const previewSource = residentMessage || input.body;

  const { data: existing } = await db
    .from("portal_inbox_thread_records")
    .select("id, row_data")
    .eq("id", threadId)
    .maybeSingle();

  if (existing?.row_data) {
    const rowData = asObject(existing.row_data) ?? {};
    const newTurns: ThreadMessage[] = residentMessage
      ? [
          {
            id: `out-${Date.now().toString(36)}`,
            from: input.residentName?.trim() || "You",
            body: residentMessage,
            at: when,
            outbound: true,
          },
          {
            id: `ack-${Date.now().toString(36)}`,
            from: ackFrom,
            body: input.body,
            at: when,
            outbound: false,
          },
        ]
      : [
          {
            id: `msg-${Date.now().toString(36)}`,
            from: ackFrom,
            body: input.body,
            at: when,
            outbound: false,
          },
        ];

    await db.from("portal_inbox_thread_records").upsert(
      {
        id: threadId,
        scope: RESIDENT_INBOX_SCOPE,
        owner_user_id: ownerUserId ?? (existing as { owner_user_id?: string | null }).owner_user_id ?? null,
        participant_email: guestEmail,
        thread_type: "portal_message",
        row_data: {
          ...rowData,
          from: displayFrom,
          email: counterpartyEmail || String(rowData.email ?? ""),
          subject: input.subject.trim() || String(rowData.subject ?? ""),
          preview: previewSource.slice(0, 100).replace(/\n/g, " "),
          time: when,
          unread: true,
          propertyId: input.propertyId,
          managerUserId: input.managerUserId,
          propertyTitle: input.propertyTitle,
          messages: appendThreadMessages(rowData, newTurns),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    return;
  }

  const messages: ThreadMessage[] = residentMessage
    ? [
        {
          id: `ack-${Date.now().toString(36)}`,
          from: ackFrom,
          body: input.body,
          at: when,
          outbound: false,
        },
      ]
    : [];

  await db.from("portal_inbox_thread_records").upsert(
    {
      id: threadId,
      scope: RESIDENT_INBOX_SCOPE,
      owner_user_id: ownerUserId,
      participant_email: guestEmail,
      thread_type: "portal_message",
      row_data: {
        id: threadId,
        folder: "inbox",
        from: displayFrom,
        email: counterpartyEmail,
        subject: input.subject,
        preview: previewSource.slice(0, 100).replace(/\n/g, " "),
        body: residentMessage || input.body,
        time: when,
        unread: true,
        scope: RESIDENT_INBOX_SCOPE,
        propertyId: input.propertyId,
        managerUserId: input.managerUserId,
        propertyTitle: input.propertyTitle,
        ...(residentMessage ? { rootOutbound: true } : {}),
        ...(messages.length ? { messages } : {}),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

/**
 * Resident-initiated chat in the property-scoped thread (no PropLane ack turn).
 * Writes the resident outbound copy and the manager inbound copy on the same
 * stable thread id used by tour and listing messages.
 */
export async function deliverResidentPropertyManagerChatMessage(
  db: Db,
  input: {
    residentEmail: string;
    residentUserId: string | null;
    residentName: string;
    managerUserId: string;
    managerEmail: string;
    propertyId: string;
    propertyTitle: string;
    subject: string;
    message: string;
  },
): Promise<{ threadId: string }> {
  const residentEmail = input.residentEmail.trim().toLowerCase();
  const managerEmail = input.managerEmail.trim().toLowerCase();
  const message = input.message.trim();
  const subject = input.subject.trim();
  if (!residentEmail.includes("@") || !managerEmail.includes("@") || !message || !subject) {
    throw new Error("resident email, manager email, subject, and message are required.");
  }

  const threadId = propertyManagerConversationThreadId({
    residentEmail,
    managerUserId: input.managerUserId,
    propertyId: input.propertyId,
  });
  const when = formatPacificDateTime(new Date());
  const displayFrom = propertyManagerThreadLabel(input.propertyTitle);
  const residentName = input.residentName.trim() || "You";
  const preview = message.slice(0, 100).replace(/\n/g, " ");

  const outboundTurn: ThreadMessage = {
    id: `out-${Date.now().toString(36)}`,
    from: residentName,
    body: message,
    at: when,
    outbound: true,
  };

  const { data: residentExisting } = await db
    .from("portal_inbox_thread_records")
    .select("id, row_data, owner_user_id")
    .eq("id", threadId)
    .maybeSingle();

  if (residentExisting?.row_data) {
    const rowData = asObject(residentExisting.row_data) ?? {};
    await db.from("portal_inbox_thread_records").upsert(
      {
        id: threadId,
        scope: RESIDENT_INBOX_SCOPE,
        owner_user_id:
          input.residentUserId ??
          (residentExisting as { owner_user_id?: string | null }).owner_user_id ??
          null,
        participant_email: residentEmail,
        thread_type: "portal_message",
        row_data: {
          ...rowData,
          from: displayFrom,
          email: managerEmail || String(rowData.email ?? ""),
          subject: subject || String(rowData.subject ?? ""),
          preview,
          time: when,
          unread: false,
          propertyId: input.propertyId,
          managerUserId: input.managerUserId,
          propertyTitle: input.propertyTitle,
          messages: appendThreadMessages(rowData, [outboundTurn]),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } else {
    await db.from("portal_inbox_thread_records").upsert(
      {
        id: threadId,
        scope: RESIDENT_INBOX_SCOPE,
        owner_user_id: input.residentUserId,
        participant_email: residentEmail,
        thread_type: "portal_message",
        row_data: {
          id: threadId,
          folder: "inbox",
          from: displayFrom,
          email: managerEmail,
          subject,
          preview,
          body: message,
          time: when,
          unread: false,
          scope: RESIDENT_INBOX_SCOPE,
          propertyId: input.propertyId,
          managerUserId: input.managerUserId,
          propertyTitle: input.propertyTitle,
          rootOutbound: true,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  }

  await appendManagerPropertyLeadInboxMessage(db, input.managerUserId, {
    propertyId: input.propertyId,
    propertyTitle: input.propertyTitle,
    prospectName: residentName,
    prospectEmail: residentEmail,
    topic: subject,
    subject,
    body: message,
  });

  return { threadId };
}

/** Manager-side thread for the same property conversation. */
export async function appendManagerPropertyLeadInboxMessage(
  db: Db,
  managerUserId: string,
  input: {
    propertyId: string;
    propertyTitle: string;
    prospectName: string;
    prospectEmail: string;
    topic: string;
    subject: string;
    body: string;
  },
): Promise<void> {
  const prospectEmail = input.prospectEmail.trim().toLowerCase();
  if (!prospectEmail.includes("@")) return;

  const threadId = propertyManagerConversationThreadId({
    residentEmail: prospectEmail,
    managerUserId,
    propertyId: input.propertyId,
  });
  const when = formatPacificDateTime(new Date());
  const propertyLabel = input.propertyTitle.trim() || input.propertyId;
  const threadSubject = `${propertyLabel} — ${input.topic.trim() || input.subject}`;

  const { data: existing } = await db
    .from("portal_inbox_thread_records")
    .select("id, row_data")
    .eq("id", threadId)
    .maybeSingle();

  const inboundTurn: ThreadMessage = {
    id: `lead-${Date.now().toString(36)}`,
    from: input.prospectName.trim() || prospectEmail,
    body: input.body,
    at: when,
    outbound: false,
  };

  if (existing?.row_data) {
    const rowData = asObject(existing.row_data) ?? {};
    await db.from("portal_inbox_thread_records").upsert(
      {
        id: threadId,
        scope: MANAGER_INBOX_SCOPE,
        owner_user_id: managerUserId,
        participant_email: prospectEmail,
        thread_type: "portal_message",
        row_data: {
          ...rowData,
          from: input.prospectName.trim() || prospectEmail,
          email: prospectEmail,
          subject: threadSubject,
          preview: input.body.slice(0, 100).replace(/\n/g, " "),
          time: when,
          unread: true,
          propertyId: input.propertyId,
          propertyTitle: propertyLabel,
          messages: appendThreadMessages(rowData, [inboundTurn]),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    return;
  }

  await db.from("portal_inbox_thread_records").upsert(
    {
      id: threadId,
      scope: MANAGER_INBOX_SCOPE,
      owner_user_id: managerUserId,
      participant_email: prospectEmail,
      thread_type: "portal_message",
      row_data: {
        id: threadId,
        folder: "inbox",
        from: input.prospectName.trim() || prospectEmail,
        email: prospectEmail,
        subject: threadSubject,
        preview: input.body.slice(0, 100).replace(/\n/g, " "),
        body: input.body,
        time: when,
        unread: true,
        scope: MANAGER_INBOX_SCOPE,
        propertyId: input.propertyId,
        propertyTitle: propertyLabel,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}
