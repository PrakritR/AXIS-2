"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { MockProperty } from "@/data/types";

export function PropertyCard({ property }: { property: MockProperty }) {
  const { showToast } = useAppUi();
  const listingPath = `/rent/listings/${property.id}`;

  const copyListingLink = async () => {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}${listingPath}` : listingPath;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Listing link copied");
    } catch {
      showToast("Could not copy link");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-primary/15 hover:shadow-[0_20px_50px_-28px_rgba(15,23,42,0.18)] active:translate-y-0 active:scale-[0.99]">
      <div className="relative aspect-[16/10] bg-gradient-to-br from-slate-100 to-slate-200">
        <div className="absolute left-4 top-4">
          <Badge tone="info">{property.neighborhood}</Badge>
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-slate-700">
          <span className="rounded-full bg-white/80 px-3 py-1 font-semibold backdrop-blur">
            {property.beds} bd · {property.baths} ba
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1 font-semibold backdrop-blur">
            {property.available}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {property.tagline}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">
            {property.title}
          </h3>
          <p className="mt-1 text-sm text-muted">{property.address}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">ZIP {property.zip}</p>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted">From</p>
              <p className="text-xl font-semibold text-foreground">
                {property.rentLabel}
              </p>
            </div>
            <Badge tone={property.petFriendly ? "success" : "neutral"}>
              {property.petFriendly ? "Pet friendly" : "Ask about pets"}
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link href={listingPath} className="contents">
              <Button type="button" variant="outline" className="w-full text-[13px] sm:text-sm">
                Properties
              </Button>
            </Link>
            <Link href="/rent/tours-contact" className="contents">
              <Button type="button" variant="outline" className="w-full text-[13px] sm:text-sm">
                Schedule tour
              </Button>
            </Link>
            <Link href="/rent/apply" className="contents">
              <Button type="button" className="w-full text-[13px] sm:text-sm">
                Apply
              </Button>
            </Link>
          </div>
          <div className="flex justify-center">
            <Button type="button" variant="ghost" className="text-[13px] font-semibold text-primary" onClick={copyListingLink}>
              Share
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
