import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import { normalizePostAuthPath } from "@/lib/auth/normalize-post-auth-path";
import { readOAuthNextPathFromRequest } from "@/lib/auth/oauth-next-cookie";
import type { NextRequest } from "next/server";
import { assertNonProdDatabase } from "@/lib/server-env";

function resolvePostAuthPath(request: NextRequest): string {
  const fromCookie = readOAuthNextPathFromRequest(request);
  if (fromCookie?.startsWith("/")) return normalizePostAuthPath(fromCookie);

  const fromQuery = request.nextUrl.searchParams.get("next");
  if (fromQuery?.startsWith("/")) return normalizePostAuthPath(fromQuery);

  return "/auth/continue";
}

export async function GET(request: NextRequest) {
  assertNonProdDatabase();
  return handleOAuthCallback(request, resolvePostAuthPath(request));
}
