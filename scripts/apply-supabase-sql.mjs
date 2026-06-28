#!/usr/bin/env node
/**
 * Apply a SQL migration file to the linked Supabase Postgres database.
 *
 * Usage:
 *   npm run db:apply-sql -- supabase/migrations/<file>.sql
 *
 * Requires DATABASE_URL, or Supabase_Database_Password (+ NEXT_PUBLIC_SUPABASE_URL).
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { postgresConnectionStringFromEnv, postgresSslFromEnv } from "./supabase-db-connection.mjs";

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
  return postgresConnectionStringFromEnv();
}

const conn = connectionString();
if (!conn) {
  console.error(
    "Missing DATABASE_URL or Supabase_Database_Password (+ NEXT_PUBLIC_SUPABASE_URL).\n" +
      "Get the connection string from Supabase → Project Settings → Database.",
  );
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");
const client = new pg.Client({
  connectionString: conn,
  ssl: postgresSslFromEnv(),
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
