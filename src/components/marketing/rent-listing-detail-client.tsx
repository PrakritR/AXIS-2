"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListingDetailSections } from "@/components/marketing/listing-detail-sections";
import { getListingRichContent } from "@/data/listing-rich-content";
import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { loadPublicExtraListingsFromServer, PROPERTY_PIPELINE_EVENT, readExtraListings } from "@/lib/demo-property-pipeline";
import { MANAGER_APPLICATIONS_EVENT, syncPublicApprovedApplicationsFromServer } from "@/lib/manager-applications-storage";

export function RentListingDetailClient({ id }: { id: string }) {
  const base = mockProperties.find((p) => p.id === id);
  const [extra, setExtra] = useState<MockProperty | null | undefined>(undefined);
  const [applicationTick, setApplicationTick] = useState(0);

  useEffect(() => {
    if (base) return;
    const pick = () => readExtraListings().find((p) => p.id === id) ?? null;
    const timeoutId = window.setTimeout(() => setExtra(pick()), 0);
    void loadPublicExtraListingsFromServer().then((rows) => setExtra(rows.find((p) => p.id === id) ?? pick()));
    const on = () => setExtra(pick());
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
    };
  }, [id, base]);

  useEffect(() => {
    const refreshApplications = () => {
      void syncPublicApprovedApplicationsFromServer().then(() => setApplicationTick((tick) => tick + 1));
    };
    const id = window.setTimeout(refreshApplications, 0);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, refreshApplications);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener(MANAGER_APPLICATIONS_EVENT, refreshApplications);
    };
  }, []);

  if (base) {
    void applicationTick;
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

  void applicationTick;
  const rich = getListingRichContent(extra);
  return <ListingDetailSections property={extra} rich={rich} />;
}
