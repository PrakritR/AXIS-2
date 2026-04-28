import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type RecordConfig = {
  table: string;
  select?: string;
  orderColumn?: string;
  normalize?: (row: Record<string, unknown>) => Record<string, unknown>;
  scope?: (query: unknown, user: { id: string; email?: string | null; role: string }) => unknown;
  buildUpsert: (row: Record<string, unknown>) => Record<string, unknown>;
};

async function sessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export function createJsonRecordRoute(config: RecordConfig) {
  async function getUserContext() {
    const user = await sessionUser();
    if (!user) return null;
    const db = createSupabaseServiceRoleClient();
    const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
    return {
      db,
      user: {
        id: user.id,
        email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
        role: String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase(),
      },
    };
  }

  return {
    GET: async () => {
      try {
        const ctx = await getUserContext();
        if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
        let query = ctx.db
          .from(config.table)
          .select(config.select ?? "id, row_data, updated_at")
          .order(config.orderColumn ?? "updated_at", { ascending: false });
        if (config.scope) query = config.scope(query, ctx.user) as typeof query;
        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const records = (Array.isArray(data) ? data : []) as unknown as Record<string, unknown>[];
        const rows = records.map((record) => {
          const row = (record.row_data && typeof record.row_data === "object" ? record.row_data : record) as Record<string, unknown>;
          return config.normalize ? config.normalize(row) : row;
        });
        return NextResponse.json({ rows });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load records.";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    },
    POST: async (req: Request) => {
      try {
        const ctx = await getUserContext();
        if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
        const body = (await req.json()) as {
          action?: "upsert" | "delete" | "replace";
          id?: string;
          row?: Record<string, unknown>;
          rows?: Record<string, unknown>[];
        };
        if (body.action === "delete") {
          const id = body.id?.trim();
          if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
          const { error } = await ctx.db.from(config.table).delete().eq("id", id);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ ok: true });
        }

        const rows = body.action === "replace" ? body.rows ?? [] : body.row ? [body.row] : [];
        if (rows.length === 0) return NextResponse.json({ error: "row required" }, { status: 400 });
        for (const row of rows) {
          const normalized = config.normalize ? config.normalize(row) : row;
          const record = config.buildUpsert(normalized);
          if (!record.id) return NextResponse.json({ error: "row id required" }, { status: 400 });
          const { error } = await ctx.db.from(config.table).upsert(record, { onConflict: "id" });
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to save records.";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    },
  };
}
