"use client";

import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import { MANAGER_PRICING_ENTRY_PATH } from "@/lib/auth/manager-pricing-entry-path";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

function FinishContent() {
  const router = useRouter();
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    void (async () => {
      try {
        const res = await fetch("/api/auth/provision-pending-manager", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          // New manager accounts created via Google/Apple start on a 14-day Pro
          // trial (no card). The pricing flow's free-select caller omits this.
          body: JSON.stringify({ trial: true }),
        });
        const body = (await res.json()) as { error?: string; redirectTo?: string; existingAccount?: boolean };
        if (!res.ok) {
          router.replace(`/auth/create-account?role=manager&message=${encodeURIComponent(body.error ?? "Could not create manager account.")}`);
          return;
        }
        router.replace(
          nativeAwarePath(
            body.redirectTo?.startsWith("/")
              ? body.redirectTo
              : body.existingAccount
                ? "/portal/dashboard"
                : MANAGER_PRICING_ENTRY_PATH,
          ),
        );
      } catch {
        router.replace("/auth/create-account?role=manager");
      }
    })();
  }, [router]);

  return <AuthOAuthLoading label="Setting up your manager account" caption="Setting up your manager account…" />;
}

export default function ManagerRegisterOauthPage() {
  return (
    <Suspense fallback={<AuthOAuthLoading />}>
      <FinishContent />
    </Suspense>
  );
}
