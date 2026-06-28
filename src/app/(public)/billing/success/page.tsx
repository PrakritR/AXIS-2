"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { ChromeSubstrate } from "@/components/brand/chrome-substrate";

function BillingSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!sessionId) return;
    router.replace(
      `/auth/create-account?role=manager&session_id=${encodeURIComponent(sessionId)}`,
    );
  }, [sessionId, router]);

  if (sessionId) {
    return (
      <div className="relative flex min-h-[50vh] items-center justify-center px-4 py-16">
        <ChromeSubstrate variant="full" />
        <div className="glass-card relative mx-auto max-w-md rounded-[24px] px-8 py-10 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
          <p className="text-sm text-muted">Redirecting to account setup…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[60vh] items-center justify-center px-4 py-16">
      <ChromeSubstrate variant="full" />
      <div className="glass-card relative mx-auto max-w-lg rounded-[24px] px-8 py-10 text-center shadow-[0_24px_60px_-20px_rgba(8,11,20,0.55),inset_0_1px_0_rgba(255,255,255,0.22)]">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-fg)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Payment confirmed</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Payment successful</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Missing session reference. If you paid successfully, use the link from your email or start again from pricing.
        </p>
        <Link href="/partner/pricing" className="btn-cobalt mt-8 inline-flex items-center justify-center rounded-full px-8 py-3 text-sm font-semibold">
          Back to pricing
        </Link>
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-sm text-muted">Loading…</div>}>
      <BillingSuccessContent />
    </Suspense>
  );
}
