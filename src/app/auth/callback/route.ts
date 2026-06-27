import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import type { NextRequest } from "next/server";

function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith("/")) return raw;
  return "/auth/continue";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  return handleOAuthCallback(request, next);
}
