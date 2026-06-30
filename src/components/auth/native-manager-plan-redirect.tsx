"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthLoadingCard } from "@/components/auth/auth-mobile-primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { MANAGER_PLAN_PORTAL_URL } from "@/lib/portals/manager-plan-path";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Native: plan selection lives in the portal — not on a giant auth signup screen. */
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
      if (session) {
        router.replace(MANAGER_PLAN_PORTAL_URL);
        return;
      }
      router.replace("/auth/sign-in?mode=create&role=manager");
    })();
  }, [isNative, router]);

  if (isNative === null || !isNative) {
    return (
      <AuthCard>
        <AuthLoadingCard />
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthLoadingCard label="Opening plans…" />
    </AuthCard>
  );
}
