import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import { maybeNativeOAuthBridgeResponse } from "@/lib/auth/native-oauth-bridge";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const bridge = maybeNativeOAuthBridgeResponse(request);
  if (bridge) return bridge;

  return handleOAuthCallback(request, "/auth/resident-oauth-finish");
}
