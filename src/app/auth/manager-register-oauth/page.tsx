"use client";

import { AxisLogoMark } from "@/components/brand/axis-logo";
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

  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <AxisLogoMark />
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-steel-light/25 border-t-steel-light"
        role="status"
        aria-label="Setting up your manager account"
      />
      <p className="text-sm text-muted">Setting up your manager account…</p>
    </div>
  );
}

export default function ManagerRegisterOauthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center gap-6 py-10">
          <AxisLogoMark />
          <p className="text-sm text-muted">Loading…</p>
        </div>
      }
    >
      <FinishContent />
    </Suspense>
  );
}
