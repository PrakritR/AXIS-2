import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

type RecordConfig = {
  table: string;
  select?: string;
  orderColumn?: string;
  normalize?: (row: Record<string, unknown>) => Record<string, unknown>;
  scope?: (query: unknown, user: { id: string; email?: string | null; role: string }) => unknown;
  buildUpsert: (row: Record<string, unknown>, user: { id: string; email?: string | null; role: string }) => Record<string, unknown>;
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
    const admin = await isAdminUser(user.id);
    return {
      db,
      user: {
        id: user.id,
        email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
        role: admin ? "admin" : String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase(),
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
          let visibleQuery = ctx.db.from(config.table).select("id").eq("id", id).limit(1);
          if (config.scope) visibleQuery = config.scope(visibleQuery, ctx.user) as typeof visibleQuery;
          const { data: visible, error: visibleError } = await visibleQuery;
          if (visibleError) return NextResponse.json({ error: visibleError.message }, { status: 500 });
          if (!Array.isArray(visible) || visible.length === 0) {
            return NextResponse.json({ error: "Record not found." }, { status: 404 });
          }
          const { error } = await ctx.db.from(config.table).delete().eq("id", id);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          return NextResponse.json({ ok: true });
        }

        const rows = body.action === "replace" ? body.rows ?? [] : body.row ? [body.row] : [];
        if (rows.length === 0) return NextResponse.json({ error: "row required" }, { status: 400 });
        for (const row of rows) {
          const normalized = config.normalize ? config.normalize(row) : row;
          const record = config.buildUpsert(normalized, ctx.user);
          if (!record.id) return NextResponse.json({ error: "row id required" }, { status: 400 });
          const id = String(record.id);
          const { data: existing, error: existingError } = await ctx.db.from(config.table).select("id").eq("id", id).limit(1);
          if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
          if (Array.isArray(existing) && existing.length > 0 && config.scope) {
            let visibleQuery = ctx.db.from(config.table).select("id").eq("id", id).limit(1);
            visibleQuery = config.scope(visibleQuery, ctx.user) as typeof visibleQuery;
            const { data: visible, error: visibleError } = await visibleQuery;
            if (visibleError) return NextResponse.json({ error: visibleError.message }, { status: 500 });
            if (!Array.isArray(visible) || visible.length === 0) {
              return NextResponse.json({ error: "Record not found." }, { status: 404 });
            }
          }
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
