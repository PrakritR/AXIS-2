export type InboxThreadUpsertUser = { id: string; email?: string | null };

/** Sent threads (and trash restored from sent) keep owner-only mailbox columns. */
export function sentLikeInboxFolder(row: Record<string, unknown>): boolean {
  const folder = String(row.folder ?? "");
  const previousFolder = String(row.previousFolder ?? row.previous_folder ?? "");
  const id = String(row.id ?? "");
  if (folder === "sent") return true;
  if (folder === "trash") {
    if (previousFolder === "sent") return true;
    if (previousFolder === "inbox") return false;
    if (/^msg_inbox_|^welcome_inbox_/.test(id)) return false;
    if (/^(sent_|msg_|welcome_)/.test(id)) return true;
  }
  return false;
}

export function buildPortalInboxThreadUpsert(row: Record<string, unknown>, user: InboxThreadUpsertUser) {
  const sentLike = sentLikeInboxFolder(row);
  const participantEmail = sentLike
    ? null
    : String(row.participantEmail ?? row.participant_email ?? user.email ?? "")
        .trim()
        .toLowerCase() || null;

  return {
    id: row.id,
    scope: row.scope ?? "portal",
    owner_user_id:
      row.scope === "admin" ? null : (row.ownerUserId ?? row.owner_user_id ?? user.id),
    participant_email: participantEmail,
    thread_type: row.threadType ?? row.thread_type ?? null,
    row_data: row,
    updated_at: new Date().toISOString(),
  };
}
