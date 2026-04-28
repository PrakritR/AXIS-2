import { createJsonRecordRoute } from "@/lib/portal-record-api";

export const runtime = "nodejs";

const route = createJsonRecordRoute({
  table: "portal_inbox_thread_records",
  scope: (query, user) => {
    const q = query as { or: (expr: string) => unknown };
    if (user.role === "admin") return query;
    return q.or(`owner_user_id.eq.${user.id},participant_email.eq.${user.email ?? ""}`);
  },
  normalize: (row) => ({
    ...row,
    id: String(row.id ?? "").trim(),
    email: String(row.email ?? row.participantEmail ?? row.participant_email ?? "").trim().toLowerCase(),
  }),
  buildUpsert: (row) => ({
    id: row.id,
    scope: row.scope ?? "portal",
    owner_user_id: row.ownerUserId ?? row.owner_user_id ?? null,
    participant_email: row.email ?? row.participantEmail ?? null,
    thread_type: row.threadType ?? row.thread_type ?? null,
    row_data: row,
    updated_at: new Date().toISOString(),
  }),
});

export const GET = route.GET;
export const POST = route.POST;
