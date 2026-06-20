import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { createJsonRecordRoute } from "@/lib/portal-record-api";

export const runtime = "nodejs";

const route = createJsonRecordRoute({
  table: "portal_inbox_thread_records",
  scope: (query, user) => {
    const q = query as { or: (expr: string) => unknown };
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
  assignOwnership: (record, user) =>
    user.role === "admin" ? record : { ...record, owner_user_id: user.id },
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scopeParam = url.searchParams.get("scope") ?? "";

    const auth = await createSupabaseServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("email").eq("id", user.id).maybeSingle();
    const userEmail = (profile?.email ?? user.email ?? "").trim().toLowerCase();

    let query = db
      .from("portal_inbox_thread_records")
      .select("id, row_data, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500)
      .or(`owner_user_id.eq.${user.id},participant_email.eq.${userEmail}`);

    if (scopeParam) {
      query = query.eq("scope", scopeParam) as typeof query;
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const records = (Array.isArray(data) ? data : []) as { id: string; row_data: unknown; updated_at: string }[];
    const rows = records.map((record) => {
      const row = (record.row_data && typeof record.row_data === "object" ? record.row_data : record) as Record<string, unknown>;
      return {
        ...row,
        id: String(row.id ?? "").trim(),
        email: String(row.email ?? "").trim().toLowerCase(),
      };
    });

    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = route.POST;
