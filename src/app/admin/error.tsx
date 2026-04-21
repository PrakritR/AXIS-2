"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-rose-200/90 bg-rose-50/90 px-5 py-6 text-sm text-rose-950 shadow-sm">
      <p className="font-semibold text-rose-950">This admin page failed to load.</p>
      <p className="mt-2 leading-relaxed text-rose-900/90">
        {error.message || "An unexpected error occurred. Try again or return to the dashboard."}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" variant="primary" className="rounded-full" onClick={() => reset()}>
          Try again
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={() => (window.location.href = "/admin/dashboard")}>
          Admin dashboard
        </Button>
      </div>
    </div>
  );
}
