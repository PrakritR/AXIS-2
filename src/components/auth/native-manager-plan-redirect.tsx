"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthLoadingCard } from "@/components/auth/auth-mobile-primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Native: subscription plan selection is not available in the iOS app (App Store
 * Guideline 2.1(b)). Route native users away from the plan/pricing surface — a
 * signed-in manager goes to their dashboard, a signed-out visitor to account
 * creation. NEVER to the in-portal plan/billing purchase screen.
 */
export function NativeManagerPlanRedirect() {
  const router = useRouter();
  const { isNative } = useIsNativeApp();

  useEffect(() => {
    if (!isNative) return;

    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      router.replace(session ? "/portal/dashboard" : "/auth/create-account");
    })();
  }, [isNative, router]);

  return (
    <AuthCard>
      <AuthLoadingCard label="Opening Axis…" />
    </AuthCard>
  );
}
