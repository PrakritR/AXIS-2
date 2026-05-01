"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PropertyCard } from "@/components/marketing/property-card";
import { RoomListingCard } from "@/components/marketing/room-listing-card";
import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { loadPublicExtraListingsFromServer, PROPERTY_PIPELINE_EVENT, readExtraListingsPublic } from "@/lib/demo-property-pipeline";
import { MANAGER_APPLICATIONS_EVENT, syncPublicApprovedApplicationsFromServer } from "@/lib/manager-applications-storage";
import { parseRadiusParam, parseUSZip } from "@/lib/listings-search";
import { filterRoomListings } from "@/lib/room-listings-catalog";

function firstString(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export function parseListingsSearchFromParams(
  sp: Record<string, string | string[] | undefined>,
  firstStringFn: (v: string | string[] | undefined) => string | undefined,
) {
  const zipRaw = firstStringFn(sp.zip) ?? "";
  const centerZip = parseUSZip(zipRaw);
  const radiusMiles = parseRadiusParam(firstStringFn(sp.radius));
  const moveIn = firstStringFn(sp.moveIn) ?? "";
  const moveOut = firstStringFn(sp.moveOut) ?? "";
  const maxBudgetRaw = firstStringFn(sp.maxBudget);
  const maxBudgetNum =
    maxBudgetRaw != null && maxBudgetRaw !== "" && Number.isFinite(Number(maxBudgetRaw)) ? Number(maxBudgetRaw) : null;
  const bathroom = firstStringFn(sp.bathroom) ?? "any";
  return { zipRaw, centerZip, radiusMiles, moveIn, moveOut, maxBudgetNum, bathroom };
}

export function RentListingsView() {
  const searchParams = useSearchParams();
  const [extras, setExtras] = useState<MockProperty[]>([]);
  const [applicationTick, setApplicationTick] = useState(0);

  const props = useMemo(() => {
    const sp: Record<string, string | undefined> = {};
    searchParams.forEach((value, key) => {
      sp[key] = value;
    });
    return parseListingsSearchFromParams(sp, firstString);
  }, [searchParams]);

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

  const centerZip = parseUSZip(props.zipRaw);
  const hasSearch =
    centerZip !== null ||
    props.maxBudgetNum !== null ||
    (props.bathroom && props.bathroom !== "any") ||
    Boolean(props.moveIn) ||
    Boolean(props.moveOut);

  const roomResults = useMemo(
    () => {
      void applicationTick;
      return filterRoomListings(combined, {
        zipRaw: props.zipRaw,
        radiusMiles: props.radiusMiles,
        maxBudgetNum: props.maxBudgetNum,
        bathroom: props.bathroom,
        moveIn: props.moveIn,
        moveOut: props.moveOut,
      });
    },
    [combined, props.bathroom, props.maxBudgetNum, props.radiusMiles, props.zipRaw, props.moveIn, props.moveOut, applicationTick],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-5 sm:py-14">
      <div className="border-b border-slate-200/70 pb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Listings</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-950 sm:text-3xl">
          {hasSearch ? "Available rooms" : "Available properties"}
        </h1>
      </div>

      {hasSearch ? (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3.5 text-sm text-slate-700 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p>
            {centerZip !== null ? (
              <>
                <span className="font-semibold text-slate-900">ZIP {props.zipRaw}</span>
                <span className="text-slate-500"> · </span>
                <span>
                  Within <span className="font-semibold text-slate-900">{props.radiusMiles} mi</span>
                </span>
              </>
            ) : (
              <span className="font-semibold text-slate-900">All ZIPs</span>
            )}
            {props.moveIn ? (
              <>
                <span className="text-slate-500"> · </span>
                Move-in {props.moveIn}
              </>
            ) : null}
            {props.moveOut ? (
              <>
                <span className="text-slate-500"> · </span>
                Move-out {props.moveOut}
              </>
            ) : null}
            {props.maxBudgetNum !== null ? (
              <>
                <span className="text-slate-500"> · </span>
                Max ${props.maxBudgetNum.toLocaleString()}/mo
              </>
            ) : null}
            {props.bathroom && props.bathroom !== "any" ? (
              <>
                <span className="text-slate-500"> · </span>
                Bath: {props.bathroom}
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

      {hasSearch && roomResults.length === 0 ? (
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
          {hasSearch
            ? roomResults.map((room) => <RoomListingCard key={room.key} row={room} />)
            : combined.map((property) => <PropertyCard key={property.id} property={property} />)}
        </div>
      )}
    </div>
  );
}
