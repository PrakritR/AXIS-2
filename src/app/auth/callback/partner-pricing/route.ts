import { handleOAuthCallback } from "@/lib/auth/oauth-callback-handler";
import { maybeNativeOAuthBridgeResponse } from "@/lib/auth/native-oauth-bridge";
import { ensureFreeManagerPortalAccess } from "@/lib/auth/manager-portal-provision";
import { MANAGER_PRICING_ENTRY_PATH } from "@/lib/auth/manager-pricing-entry-path";
import {
  clearPricingOfferCookie,
  readPricingOfferFromRequest,
} from "@/lib/auth/manager-pricing-oauth-storage";
import {
  clearPreOAuthUserCookie,
  readPreOAuthUserFromRequest,
} from "@/lib/auth/pre-oauth-user";
import { resolveOAuthPortalRedirect } from "@/lib/auth/resolve-oauth-portal-access";
import type { NextRequest } from "next/server";

/** Fixed OAuth return path for partner pricing — tier-aware redirect after free account setup. */
export async function GET(request: NextRequest) {
  const bridge = maybeNativeOAuthBridgeResponse(request);
  if (bridge) return bridge;

  const offer = readPricingOfferFromRequest(request);
  const priorUserId = readPreOAuthUserFromRequest(request);

  const response = await handleOAuthCallback(request, `${MANAGER_PRICING_ENTRY_PATH}?google_signed_in=1`, {
    resolveRedirect: async (service, user, safePath) => {
      const tier = offer?.tier ?? "free";
      if (offer?.trialSignup) {
        const params = new URLSearchParams({
          mode: "create",
          role: "manager",
          google_signed_in: "1",
          tier: offer.tier,
          billing: offer.billing,
        });
        return `/auth/create-account?${params}`;
      }
      if (tier === "free") {
        // The user explicitly chose the Free manager plan — provision before entering the
        // portal so a brand-new Google account lands on a working dashboard.
        const provisioned = await ensureFreeManagerPortalAccess(service, user);
        if (provisioned.status === "portal_ready") {
          if (priorUserId && priorUserId === user.id) {
            const params = new URLSearchParams({
              mode: "create",
              role: "manager",
              same_account: "1",
              tier,
              billing: offer?.billing ?? "monthly",
            });
            return `/auth/create-account?${params}`;
          }
          return "/portal/dashboard";
        }
        // Resident-only / primary-admin / pending-paid accounts: route by role instead.
        return resolveOAuthPortalRedirect(service, user, safePath, { intent: "manager" });
      }
      if (offer?.returnSurface === "mobile-plan") {
        return "/auth/manager/plan?google_signed_in=1";
      }
      // Paid plan chosen on the pricing page — return there and resume the offer in the
      // inline signup modal (account provisioning + embedded checkout).
      return "/partner/pricing?google_signed_in=1";
    },
  });

  clearPricingOfferCookie(response);
  clearPreOAuthUserCookie(response);
  return response;
}
