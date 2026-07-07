import type { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Resolve the signed-in user from SSR cookies, falling back to a Bearer access token. */
export async function getRequestAuthUser(
  supabase: SupabaseClient,
  req: NextRequest,
): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user;

  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  const {
    data: { user: tokenUser },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !tokenUser) return null;
  return tokenUser;
}
