import { Suspense } from "react";
import { RentListingsView } from "@/components/marketing/rent-listings-view";

function ListingsFallback() {
  return (
    <div
      className="mx-auto flex min-h-[40vh] max-w-6xl flex-col items-center justify-center gap-4 px-4 py-16"
      aria-live="polite"
    >
      <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200/80" />
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-slate-700">Loading rooms…</p>
        <div className="mx-auto h-2 w-40 overflow-hidden rounded-full bg-slate-200/70">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary/30" />
        </div>
      </div>
    </div>
  );
}

/** Client URL parsing + Suspense avoids server `searchParams` / RSC edge cases that can 500 the page. */
export default function ListingsPage() {
  return (
    <Suspense fallback={<ListingsFallback />}>
      <RentListingsView />
    </Suspense>
  );
}
