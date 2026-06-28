import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import {
  clearPricingOfferCookie,
  readPricingOfferFromRequest,
} from "@/lib/auth/manager-pricing-oauth-storage";
import type { NextRequest } from "next/server";

/** Fixed OAuth return path for partner pricing — tier-aware redirect after free account setup. */
export async function GET(request: NextRequest) {
  const offer = readPricingOfferFromRequest(request);

  const response = await handleOAuthCallback(request, "/partner/pricing?google_signed_in=1", {
    resolveRedirect: async (_service, _user, _safePath) => {
      const tier = offer?.tier ?? "free";
      if (tier === "free") {
        return "/portal/dashboard";
      }
      if (offer?.returnSurface === "mobile-plan") {
        return "/auth/manager/plan?google_signed_in=1";
      }
      return "/partner/pricing?google_signed_in=1&upgrade=1";
    },
  });

  clearPricingOfferCookie(response);
  return response;
}
