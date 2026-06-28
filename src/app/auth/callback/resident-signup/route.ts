import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, "/auth/resident-oauth-finish");
}
