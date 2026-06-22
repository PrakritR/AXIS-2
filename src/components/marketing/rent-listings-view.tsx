"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsClient } from "@/hooks/use-is-client";
import { PropertyCard } from "@/components/marketing/property-card";
import { RoomListingCard } from "@/components/marketing/room-listing-card";
import { LISTINGS_PENDING_SEARCH_KEY } from "@/components/marketing/home-hero-search";
import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { loadPublicExtraListingsFromServer, PROPERTY_PIPELINE_EVENT, readExtraListingsPublic } from "@/lib/demo-property-pipeline";
import { MANAGER_APPLICATIONS_EVENT, syncPublicApprovedApplicationsFromServer } from "@/lib/manager-applications-storage";
import { parseUSZip } from "@/lib/listings-search";
import { filterRoomListings } from "@/lib/room-listings-catalog";

type PendingListingsSearch = {
  zipRaw: string;
  radiusMiles: number;
  moveIn: string;
  moveOut: string;
  maxBudgetNum: number | null;
  bathroom: string;
};

const DEFAULT_SEARCH: PendingListingsSearch = {
  zipRaw: "",
  radiusMiles: 10,
  moveIn: "",
  moveOut: "",
  maxBudgetNum: null,
  bathroom: "any",
};

function readPendingListingsSearch(): PendingListingsSearch {
  if (typeof window === "undefined") return DEFAULT_SEARCH;
  try {
    const raw = window.sessionStorage.getItem(LISTINGS_PENDING_SEARCH_KEY);
    window.sessionStorage.removeItem(LISTINGS_PENDING_SEARCH_KEY);
    if (!raw) return DEFAULT_SEARCH;
    const parsed = JSON.parse(raw) as Partial<PendingListingsSearch>;
    return {
      zipRaw: typeof parsed.zipRaw === "string" ? parsed.zipRaw : "",
      radiusMiles: typeof parsed.radiusMiles === "number" ? parsed.radiusMiles : 10,
      moveIn: typeof parsed.moveIn === "string" ? parsed.moveIn : "",
      moveOut: typeof parsed.moveOut === "string" ? parsed.moveOut : "",
      maxBudgetNum: typeof parsed.maxBudgetNum === "number" ? parsed.maxBudgetNum : null,
      bathroom: typeof parsed.bathroom === "string" ? parsed.bathroom : "any",
    };
  } catch {
    return DEFAULT_SEARCH;
  }
}

export function RentListingsView() {
  const isClient = useIsClient();
  const [extras, setExtras] = useState<MockProperty[]>([]);
  const [applicationTick, setApplicationTick] = useState(0);
  const search = useMemo(
    () => (isClient ? readPendingListingsSearch() : DEFAULT_SEARCH),
    [isClient],
  );

  const refreshExtras = useCallback(() => {
    setExtras(readExtraListingsPublic());
    void loadPublicExtraListingsFromServer().then(setExtras);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(refreshExtras, 0);
    const on = () => refreshExtras();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
    };
  }, [refreshExtras]);

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

  const combined = useMemo(() => {
    const byPropertyKey = new Map<string, MockProperty>();
    for (const property of [...mockProperties, ...extras]) {
      const key = `${property.buildingName}::${property.address}`.trim().toLowerCase();
      byPropertyKey.set(key, property);
    }
    return [...byPropertyKey.values()];
  }, [extras]);

  const centerZip = parseUSZip(search.zipRaw);
  const showRooms = Boolean(search.moveIn.trim()) && search.maxBudgetNum !== null;

  const roomResults = useMemo(() => {
    void applicationTick;
    if (!showRooms) return [];
    return filterRoomListings(combined, {
      zipRaw: search.zipRaw,
      radiusMiles: search.radiusMiles,
      maxBudgetNum: search.maxBudgetNum,
      bathroom: search.bathroom,
      moveIn: search.moveIn,
      moveOut: search.moveOut,
    });
  }, [combined, search, applicationTick, showRooms]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-5 sm:py-14">
      <div className="border-b border-border/60 pb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Listings</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl">
          {showRooms ? "Available rooms" : "Available properties"}
        </h1>
      </div>

      {showRooms ? (
        <div className="glass-card mt-6 flex flex-col gap-3 rounded-2xl px-4 py-3.5 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="flex flex-wrap items-center gap-x-1 gap-y-1">
            {centerZip !== null ? (
              <>
                <span className="inline-flex rounded-full border border-border/60 bg-card px-2.5 py-0.5 text-xs font-semibold text-foreground">
                  ZIP {search.zipRaw}
                </span>
                <span className="inline-flex rounded-full border border-border/60 bg-card px-2.5 py-0.5 text-xs font-semibold text-foreground">
                  {search.radiusMiles} mi
                </span>
              </>
            ) : (
              <span className="inline-flex rounded-full border border-border/60 bg-card px-2.5 py-0.5 text-xs font-semibold text-foreground">
                All ZIPs
              </span>
            )}
            <span className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Move-in {search.moveIn}
            </span>
            {search.moveOut ? (
              <span className="inline-flex rounded-full border border-border/60 bg-card px-2.5 py-0.5 text-xs font-medium text-muted">
                Move-out {search.moveOut}
              </span>
            ) : null}
            {search.maxBudgetNum !== null ? (
              <span className="inline-flex rounded-full border border-border/60 bg-card px-2.5 py-0.5 text-xs font-semibold text-foreground">
                Max ${search.maxBudgetNum.toLocaleString()}/mo
              </span>
            ) : null}
            {search.bathroom && search.bathroom !== "any" ? (
              <span className="inline-flex rounded-full border border-border/60 bg-card px-2.5 py-0.5 text-xs font-medium text-muted">
                Bath: {search.bathroom}
              </span>
            ) : null}
            {roomResults.length > 0 ? (
              <span className="inline-flex rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {roomResults.length} room{roomResults.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </p>
          <Link href="/rent/listings" className="link-premium shrink-0 text-sm font-semibold text-primary">
            Clear search
          </Link>
        </div>
      ) : null}

      {showRooms && roomResults.length === 0 ? (
        <div className="glass-card mt-12 rounded-[1.5rem] border border-dashed border-border px-6 py-14 text-center">
          <p className="text-base font-semibold text-foreground">No rooms match these filters</p>
          <p className="mt-2 text-sm text-muted">
            Try a later move-in date, a larger radius, a higher max rent, or set bathroom to Any.
          </p>
          <Link href="/rent/listings" className="link-premium mt-6 inline-flex text-sm font-semibold text-primary">
            View all properties
          </Link>
        </div>
      ) : combined.length === 0 ? (
        <div className="glass-card mt-12 rounded-[1.5rem] border border-dashed border-border px-6 py-14 text-center">
          <p className="text-base font-semibold text-foreground">Loading listings…</p>
          <p className="mt-2 text-sm text-muted">Properties appear here as they are published to the site.</p>
          <Link href="/" className="link-premium mt-6 inline-flex text-sm font-semibold text-primary">
            Search from home
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {showRooms
            ? roomResults.map((room) => <RoomListingCard key={room.key} row={room} />)
            : combined.map((property) => <PropertyCard key={property.id} property={property} />)}
        </div>
      )}
    </div>
  );
}
