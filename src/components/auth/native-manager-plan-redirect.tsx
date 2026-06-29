"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthLoadingCard } from "@/components/auth/auth-mobile-primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Native: plan selection lives in the portal — not on a giant auth signup screen. */
export function NativeManagerPlanRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!detectNativePlatformSync()) return;

    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        router.replace("/portal/plan");
        return;
      }
      router.replace("/auth/sign-in?mode=create&role=manager");
    })();
  }, [router]);

  if (!detectNativePlatformSync()) return null;

  return (
    <AuthCard>
      <AuthLoadingCard label="Opening plans…" />
    </AuthCard>
  );
}
