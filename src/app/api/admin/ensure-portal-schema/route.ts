import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import pg from "pg";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { postgresConnectionStringFromEnv, postgresSslFromEnv } from "@/lib/supabase/postgres-connection";

export const runtime = "nodejs";

const BUG_FEEDBACK_MIGRATION = "20260622120000_portal_bug_feedback_records.sql";

async function requireAdminActor(): Promise<{ ok: true } | { ok: false }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdminUser(user.id))) return { ok: false };
  return { ok: true };
}

async function feedbackTableExists(): Promise<boolean> {
  const db = createSupabaseServiceRoleClient();
  const { error } = await db.from("portal_bug_feedback_records").select("id").limit(1);
  return !error;
}

/** Admin-only: apply missing portal schema (requires DATABASE_URL or Supabase_Database_Password). */
export async function POST() {
  try {
    if (!(await requireAdminActor()).ok) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (await feedbackTableExists()) {
      return NextResponse.json({ ok: true, alreadyApplied: true, table: "portal_bug_feedback_records" });
    }

    const conn = postgresConnectionStringFromEnv();
    if (!conn) {
      return NextResponse.json(
        {
          error:
            "Database credentials not configured. Set DATABASE_URL or Supabase_Database_Password, or run the SQL migration in Supabase.",
          migrationFile: `supabase/migrations/${BUG_FEEDBACK_MIGRATION}`,
        },
        { status: 503 },
      );
    }

    const sqlPath = path.join(process.cwd(), "supabase/migrations", BUG_FEEDBACK_MIGRATION);
    const sql = fs.readFileSync(sqlPath, "utf8");
    const client = new pg.Client({
      connectionString: conn,
      ssl: postgresSslFromEnv(),
    });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end().catch(() => undefined);
    }

    const applied = await feedbackTableExists();
    if (!applied) {
      return NextResponse.json({ error: "Migration ran but portal_bug_feedback_records is still missing." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, applied: true, table: "portal_bug_feedback_records" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to apply schema.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    if (!(await requireAdminActor()).ok) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const exists = await feedbackTableExists();
    const sqlPath = path.join(process.cwd(), "supabase/migrations", BUG_FEEDBACK_MIGRATION);
    const migrationSql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, "utf8") : "";
    return NextResponse.json({
      portalBugFeedbackTable: exists ? "ready" : "missing",
      migrationFile: `supabase/migrations/${BUG_FEEDBACK_MIGRATION}`,
      migrationSql,
      canAutoApply: Boolean(postgresConnectionStringFromEnv()),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to check schema.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
