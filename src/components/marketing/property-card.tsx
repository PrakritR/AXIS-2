"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { MockProperty } from "@/data/types";

export function PropertyCard({ property }: { property: MockProperty }) {
  const { showToast, openModal } = useAppUi();

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
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
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/rent/listings/${property.id}`} className="contents">
              <Button type="button" variant="outline" className="w-full">
                View details
              </Button>
            </Link>
            <Link href="/rent/apply" className="contents">
              <Button type="button" className="w-full">
                Apply
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Link href="/rent/tours" className="contents">
              <Button type="button" variant="ghost" className="w-full">
                Tour
              </Button>
            </Link>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => showToast("Saved to demo list")}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() =>
                openModal({
                  title: "Share listing",
                  body: "Demo only — sharing will connect to your account later.",
                })
              }
            >
              Share
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
