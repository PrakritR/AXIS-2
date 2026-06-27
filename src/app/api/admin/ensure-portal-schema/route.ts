import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import pg from "pg";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const BUG_FEEDBACK_MIGRATION = "20260622120000_portal_bug_feedback_records.sql";

function postgresConnectionString(): string | null {
  const direct = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (direct) return direct;

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!password || !url) return null;

  const ref = new URL(url).hostname.split(".")[0];
  const host =
    process.env.SUPABASE_DB_HOST?.trim() ||
    process.env.SUPABASE_POOLER_HOST?.trim() ||
    `aws-1-us-west-2.pooler.supabase.com`;
  const port = process.env.SUPABASE_DB_PORT?.trim() || "6543";
  const user = process.env.SUPABASE_DB_USER?.trim() || `postgres.${ref}`;
  const database = process.env.SUPABASE_DB_NAME?.trim() || "postgres";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

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

/** Admin-only: apply missing portal schema (requires DATABASE_URL or SUPABASE_DB_PASSWORD). */
export async function POST() {
  try {
    if (!(await requireAdminActor()).ok) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (await feedbackTableExists()) {
      return NextResponse.json({ ok: true, alreadyApplied: true, table: "portal_bug_feedback_records" });
    }

    const conn = postgresConnectionString();
    if (!conn) {
      return NextResponse.json(
        {
          error:
            "Database credentials not configured. Set DATABASE_URL or SUPABASE_DB_PASSWORD, or run the SQL migration in Supabase.",
          migrationFile: `supabase/migrations/${BUG_FEEDBACK_MIGRATION}`,
        },
        { status: 503 },
      );
    }

    const sqlPath = path.join(process.cwd(), "supabase/migrations", BUG_FEEDBACK_MIGRATION);
    const sql = fs.readFileSync(sqlPath, "utf8");
    const client = new pg.Client({
      connectionString: conn,
      ssl: process.env.SUPABASE_DB_SSL === "false" ? false : { rejectUnauthorized: false },
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
      canAutoApply: Boolean(postgresConnectionString()),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to check schema.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
