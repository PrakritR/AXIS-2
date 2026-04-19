"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function BillingSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payment successful</h1>
      <p className="mt-3 text-sm text-slate-600">Your subscription checkout completed. You can finish setting up your manager portal account next.</p>
      {sessionId ? (
        <Link
          href={`/auth/create-manager?session_id=${encodeURIComponent(sessionId)}`}
          className="mt-8 inline-flex justify-center rounded-full px-6 py-3 text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #007aff, #339cff)" }}
        >
          Continue to create account
        </Link>
      ) : (
        <p className="mt-8 text-sm text-amber-800">Missing session reference. If you paid successfully, use the link from your email or start again from pricing.</p>
      )}
      <Link href="/partner/pricing" className="mt-4 text-sm font-semibold text-primary hover:underline">
        Back to pricing
      </Link>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-sm text-slate-500">Loading…</div>}>
      <BillingSuccessContent />
    </Suspense>
  );
}
