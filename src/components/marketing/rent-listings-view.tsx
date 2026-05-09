"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [extras, setExtras] = useState<MockProperty[]>([]);
  const [applicationTick, setApplicationTick] = useState(0);
  const [search, setSearch] = useState<PendingListingsSearch>(DEFAULT_SEARCH);

  useEffect(() => {
    setSearch(readPendingListingsSearch());
  }, []);

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
      <div className="border-b border-slate-200/70 pb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Listings</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-950 sm:text-3xl">
          {showRooms ? "Available rooms" : "Available properties"}
        </h1>
      </div>

      {showRooms ? (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3.5 text-sm text-slate-700 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p>
            {centerZip !== null ? (
              <>
                <span className="font-semibold text-slate-900">ZIP {search.zipRaw}</span>
                <span className="text-slate-500"> · </span>
                <span>
                  Within <span className="font-semibold text-slate-900">{search.radiusMiles} mi</span>
                </span>
              </>
            ) : (
              <span className="font-semibold text-slate-900">All ZIPs</span>
            )}
            <span className="text-slate-500"> · </span>
            Move-in {search.moveIn}
            {search.moveOut ? (
              <>
                <span className="text-slate-500"> · </span>
                Move-out {search.moveOut}
              </>
            ) : null}
            {search.maxBudgetNum !== null ? (
              <>
                <span className="text-slate-500"> · </span>
                Max ${search.maxBudgetNum.toLocaleString()}/mo
              </>
            ) : null}
            {search.bathroom && search.bathroom !== "any" ? (
              <>
                <span className="text-slate-500"> · </span>
                Bath: {search.bathroom}
              </>
            ) : null}
            {roomResults.length > 0 ? (
              <>
                <span className="text-slate-500"> · </span>
                <span className="font-semibold text-slate-900">
                  {roomResults.length} room{roomResults.length === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </p>
          <Link href="/rent/listings" className="shrink-0 text-sm font-semibold text-primary hover:opacity-90">
            Clear search
          </Link>
        </div>
      ) : null}

      {showRooms && roomResults.length === 0 ? (
        <div className="mt-12 rounded-[1.5rem] border border-dashed border-slate-200/90 bg-white/70 px-6 py-14 text-center shadow-[var(--shadow-sm)]">
          <p className="text-base font-semibold text-slate-800">No rooms match these filters</p>
          <p className="mt-2 text-sm text-slate-600">
            Try a later move-in date, a larger radius, a higher max rent, or set bathroom to Any.
          </p>
          <Link href="/rent/listings" className="mt-6 inline-flex text-sm font-semibold text-primary hover:opacity-90">
            View all properties
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
