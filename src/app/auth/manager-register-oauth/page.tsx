"use client";

import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
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
        });
        const body = (await res.json()) as { error?: string; redirectTo?: string };
        if (!res.ok) {
          router.replace(`/auth/create-account?role=manager&message=${encodeURIComponent(body.error ?? "Could not create manager account.")}`);
          return;
        }
        router.replace(body.redirectTo?.startsWith("/") ? body.redirectTo : "/partner/pricing");
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
