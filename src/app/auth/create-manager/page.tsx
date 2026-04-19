"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/**
 * Legacy URL after Stripe checkout. New flow uses /auth/create-account?role=manager&session_id=...
 */
function CreateManagerRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (sessionId) {
      router.replace(`/auth/create-account?role=manager&session_id=${encodeURIComponent(sessionId)}`);
    } else {
      router.replace("/auth/create-account?role=manager");
    }
  }, [sessionId, router]);

  return (
    <AuthCard>
      <p className="text-center text-sm text-slate-600">Redirecting to create account…</p>
    </AuthCard>
  );
}

export default function CreateManagerPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-slate-600">Loading…</p>
        </AuthCard>
      }
    >
      <CreateManagerRedirect />
    </Suspense>
  );
}
