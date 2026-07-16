"use client";

import type { MockProperty } from "@/data/types";
import { useListingMapCoords } from "@/hooks/use-listing-map-coords";
import { ListingLocationMap } from "@/components/marketing/listing-location-map";

export function ListingLocationBlock({
  property,
  embedded = false,
}: {
  property: Pick<MockProperty, "address" | "zip" | "neighborhood" | "unitLabel" | "mapLat" | "mapLng">;
  /** When true, render map + address only (parent supplies section chrome). */
  embedded?: boolean;
}) {
  const { coords, loading } = useListingMapCoords(property);
  const addressLine = [property.address?.trim(), property.zip?.trim()].filter(Boolean).join(", ");

  const body = (
    <>
      <p className="text-sm text-muted">{addressLine}</p>
      <div className="relative mt-4 overflow-hidden rounded-2xl">
        {loading || !coords ? (
          <div
            className="flex h-[min(22rem,48vh)] min-h-[220px] w-full items-center justify-center rounded-2xl border border-border bg-accent/30 text-sm text-muted"
            aria-busy="true"
            aria-label="Loading map"
          >
            Locating address…
          </div>
        ) : (
          <ListingLocationMap lat={coords.lat} lng={coords.lng} />
        )}
      </div>
    </>
  );

  if (embedded) return body;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold tracking-tight text-foreground">Location</h2>
      {body}
    </div>
  );
}
