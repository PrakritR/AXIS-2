#!/usr/bin/env node
/**
 * Apply a SQL migration file to the linked Supabase Postgres database.
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' node scripts/apply-supabase-sql.mjs supabase/migrations/20260622120000_portal_bug_feedback_records.sql
 *
 * Or with project password (Supabase → Project Settings → Database):
 *   SUPABASE_DB_PASSWORD='...' node --env-file=.env.local scripts/apply-supabase-sql.mjs <sql-file>
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const sqlFile = process.argv[2]?.trim();
if (!sqlFile) {
  console.error("Usage: node scripts/apply-supabase-sql.mjs <path-to.sql>");
  process.exit(1);
}

const sqlPath = path.resolve(sqlFile);
if (!fs.existsSync(sqlPath)) {
  console.error(`SQL file not found: ${sqlPath}`);
  process.exit(1);
}

function connectionString() {
  const direct = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (direct) return direct;

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!password || !url) return null;

  const ref = new URL(url).hostname.split(".")[0];
  const host = process.env.SUPABASE_DB_HOST?.trim() || `db.${ref}.supabase.co`;
  const port = process.env.SUPABASE_DB_PORT?.trim() || "5432";
  const user = process.env.SUPABASE_DB_USER?.trim() || "postgres";
  const database = process.env.SUPABASE_DB_NAME?.trim() || "postgres";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

const conn = connectionString();
if (!conn) {
  console.error(
    "Missing DATABASE_URL or SUPABASE_DB_PASSWORD (+ NEXT_PUBLIC_SUPABASE_URL).\n" +
      "Get the connection string from Supabase → Project Settings → Database.",
  );
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");
const client = new pg.Client({
  connectionString: conn,
  ssl: process.env.SUPABASE_DB_SSL === "false" ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log(`Applied ${path.basename(sqlPath)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
