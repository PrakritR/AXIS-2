import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import { readOAuthNextPathFromRequest } from "@/lib/auth/oauth-next-cookie";
import type { NextRequest } from "next/server";

function resolvePostAuthPath(request: NextRequest): string {
  const fromCookie = readOAuthNextPathFromRequest(request);
  if (fromCookie?.startsWith("/")) return fromCookie;

  const fromQuery = request.nextUrl.searchParams.get("next");
  if (fromQuery?.startsWith("/")) return fromQuery;

  return "/auth/continue";
}

export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, resolvePostAuthPath(request));
}
