import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import { clearOAuthNextCookie, readOAuthNextPathFromRequest } from "@/lib/auth/oauth-next-cookie";
import type { NextRequest } from "next/server";

function safeNextPath(raw: string | null | undefined): string {
  if (raw && raw.startsWith("/")) return raw;
  return "/auth/continue";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = safeNextPath(
    requestUrl.searchParams.get("next") ?? readOAuthNextPathFromRequest(request),
  );
  const response = await handleOAuthCallback(request, next);
  clearOAuthNextCookie(response);
  return response;
}
