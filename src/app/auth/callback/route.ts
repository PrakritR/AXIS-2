import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import { maybeNativeOAuthBridgeResponse } from "@/lib/auth/native-oauth-bridge";
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
  const bridge = maybeNativeOAuthBridgeResponse(request);
  if (bridge) return bridge;
  return handleOAuthCallback(request, resolvePostAuthPath(request));
}
