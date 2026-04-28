"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListingDetailSections } from "@/components/marketing/listing-detail-sections";
import { getListingRichContent } from "@/data/listing-rich-content";
import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { loadPublicExtraListingsFromServer, PROPERTY_PIPELINE_EVENT, readExtraListings } from "@/lib/demo-property-pipeline";

export function RentListingDetailClient({ id }: { id: string }) {
  const base = mockProperties.find((p) => p.id === id);
  const [extra, setExtra] = useState<MockProperty | null | undefined>(undefined);

  useEffect(() => {
    if (base) return;
    const pick = () => readExtraListings().find((p) => p.id === id) ?? null;
    setExtra(pick());
    void loadPublicExtraListingsFromServer().then((rows) => setExtra(rows.find((p) => p.id === id) ?? pick()));
    const on = () => setExtra(pick());
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [id, base]);

  if (base) {
    const rich = getListingRichContent(base);
    return <ListingDetailSections property={base} rich={rich} />;
  }

  if (extra === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center text-slate-600">
        <p>Loading listing…</p>
      </div>
    );
  }

  if (extra === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Listing not found</h1>
        <p className="mt-2 text-slate-600">This property may have been removed or the link is invalid.</p>
        <Link href="/rent/listings" className="mt-8 inline-flex text-sm font-semibold text-primary hover:opacity-90">
          Back to listings
        </Link>
      </div>
    );
  }

  const rich = getListingRichContent(extra);
  return <ListingDetailSections property={extra} rich={rich} />;
}
