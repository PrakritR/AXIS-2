import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import type { NextRequest } from "next/server";

/** Fixed OAuth return path for partner pricing — no query params (easier Supabase allowlist). */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, "/partner/pricing?google_signed_in=1");
}
