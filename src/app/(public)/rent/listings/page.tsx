import { Suspense } from "react";
import { RentListingsView } from "@/components/marketing/rent-listings-view";

function ListingsFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 text-center text-sm text-slate-600" aria-live="polite">
      Loading listings…
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
