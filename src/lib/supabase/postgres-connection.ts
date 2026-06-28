import "server-only";

/** Supabase Postgres password from env (supports legacy and Vercel-style names). */
export function readSupabaseDatabasePassword(): string {
  return (
    process.env.SUPABASE_DATABASE_PASSWORD?.trim() ||
    process.env.Supabase_Database_Password?.trim() ||
    process.env.SUPABASE_DB_PASSWORD?.trim() ||
    ""
  );
}

/** Build a pooler connection string from Supabase project env vars. */
export function postgresConnectionStringFromEnv(): string | null {
  const direct = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (direct) return direct;

  const password = readSupabaseDatabasePassword();
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

export function postgresSslFromEnv(): false | { rejectUnauthorized: false } {
  return process.env.SUPABASE_DB_SSL === "false" ? false : { rejectUnauthorized: false };
}
