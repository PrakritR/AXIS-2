import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import { maybeNativeOAuthBridgeResponse } from "@/lib/auth/native-oauth-bridge";
import { MANAGER_PRICING_ENTRY_PATH } from "@/lib/auth/manager-pricing-entry-path";
import {
  clearPricingOfferCookie,
  readPricingOfferFromRequest,
} from "@/lib/auth/manager-pricing-oauth-storage";
import type { NextRequest } from "next/server";

/** Fixed OAuth return path for partner pricing — tier-aware redirect after free account setup. */
export async function GET(request: NextRequest) {
  const bridge = maybeNativeOAuthBridgeResponse(request);
  if (bridge) return bridge;

  const offer = readPricingOfferFromRequest(request);

  const response = await handleOAuthCallback(request, `${MANAGER_PRICING_ENTRY_PATH}?google_signed_in=1`, {
    resolveRedirect: async (_service, _user, _safePath) => {
      const tier = offer?.tier ?? "free";
      if (tier === "free") {
        return "/portal/dashboard";
      }
      if (offer?.returnSurface === "mobile-plan") {
        return "/auth/manager/plan?google_signed_in=1";
      }
      return `${MANAGER_PRICING_ENTRY_PATH}?google_signed_in=1&upgrade=1`;
    },
  });

  clearPricingOfferCookie(response);
  return response;
}
