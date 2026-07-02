"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

// The partner contact experience is now unified into the single public
// /contact page ("Connect with Axis Team"). This route redirects there,
// preserving the ?tab=schedule deep link used by "Book consultation" CTAs.
function PartnerContactRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scheduleTab = searchParams.get("tab") === "schedule";

  useEffect(() => {
    router.replace(scheduleTab ? "/contact?tab=schedule" : "/contact");
  }, [router, scheduleTab]);

  return (
    <div className="min-h-screen px-4 py-16 sm:py-20">
      <div className="glass-card mx-auto max-w-2xl rounded-3xl p-8">
        <p className="text-center text-sm text-muted">Redirecting to Contact…</p>
      </div>
    </div>
  );
}

export default function PartnerContactPage() {
  return (
    <Suspense fallback={null}>
      <PartnerContactRedirect />
    </Suspense>
  );
}
