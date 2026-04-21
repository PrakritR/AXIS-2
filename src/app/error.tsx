"use client";

import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-rose-200/90 bg-rose-50/90 px-5 py-6 text-sm text-rose-950 shadow-sm">
        <p className="font-semibold text-rose-950">This page could not load.</p>
        <p className="mt-2 leading-relaxed text-rose-900/90">
          {error.message || "Something went wrong. Try again or go back home."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="primary" className="rounded-full" onClick={() => reset()}>
            Try again
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => (window.location.href = "/")}>
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}
