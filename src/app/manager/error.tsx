"use client";

import { Button } from "@/components/ui/button";

export default function ManagerPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-rose-200/90 bg-rose-50/90 px-5 py-8 text-center text-sm text-rose-950 shadow-sm">
      <p className="text-lg font-semibold text-rose-950">Axis Property Portal error</p>
      <p className="mt-2 leading-relaxed text-rose-900/90">
        {error.message || "This page could not be displayed. Try again or return to the dashboard."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" variant="primary" className="rounded-full" onClick={() => reset()}>
          Try again
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={() => (window.location.href = "/portal/dashboard")}>
          Dashboard
        </Button>
      </div>
    </div>
  );
}
