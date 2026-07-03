"use client";

import { NativeAuthHub } from "@/components/auth/native-auth-hub";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CreateAccountClient from "./create-account-client";

/**
 * On the WEB, manager signup lives on the pricing page (plan cards + integrated
 * Get-started section) — this route forwards there so a second signup surface never
 * drifts out of sync. Exceptions render in place:
 * - legacy post-payment links carrying a checkout session_id / resident axis_id
 *   (already-issued Stripe/return URLs keep working),
 * - resident account creation (application-link driven), which renders the hub, and
 * - the NATIVE app, whose signup stays in the hub (the pricing page bounces native
 *   users to /auth/manager/plan, which sends signed-out users back here — redirecting
 *   would loop).
 */
export default function CreateAccountRouter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isNative } = useIsNativeApp();
  const hasLegacyContext =
    Boolean(searchParams.get("session_id")?.trim()) || Boolean(searchParams.get("axis_id")?.trim());
  const isResident = searchParams.get("role") === "resident";
  const redirectToPricing = !hasLegacyContext && !isResident && isNative === false;

  useEffect(() => {
    if (!redirectToPricing) return;
    const params = new URLSearchParams();
    const tier = searchParams.get("tier");
    const billing = searchParams.get("billing");
    if (tier) params.set("tier", tier);
    if (billing) params.set("billing", billing);
    const qs = params.toString();
    router.replace(qs ? `/partner/pricing?${qs}` : "/partner/pricing");
  }, [redirectToPricing, router, searchParams]);

  if (hasLegacyContext) {
    return <CreateAccountClient />;
  }
  if (isResident || isNative === true) {
    return <NativeAuthHub defaultMode="create" />;
  }
  return null;
}
