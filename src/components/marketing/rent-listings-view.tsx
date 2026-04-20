"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PropertyCard } from "@/components/marketing/property-card";
import { mockProperties } from "@/data/mock-properties";
import type { MockProperty } from "@/data/types";
import { PROPERTY_PIPELINE_EVENT, readExtraListings } from "@/lib/demo-property-pipeline";
import { parseRadiusParam, parseUSZip } from "@/lib/listings-search";
import { filterPropertiesForCatalog } from "@/lib/property-listings-catalog";

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

/** Public rent listings — properties (not individual rooms). */
export function RentListingsView() {
  const searchParams = useSearchParams();
  const [extras, setExtras] = useState<MockProperty[]>([]);

  const props = useMemo(() => {
    const sp: Record<string, string | undefined> = {};
    searchParams.forEach((value, key) => {
      sp[key] = value;
    });
    return parseListingsSearchFromParams(sp, firstString);
  }, [searchParams]);

  const refreshExtras = useCallback(() => {
    setExtras(readExtraListings());
  }, []);

  useEffect(() => {
    refreshExtras();
    const on = () => refreshExtras();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [refreshExtras]);

  const combined = useMemo(() => [...mockProperties, ...extras], [extras]);

  const centerZip = parseUSZip(props.zipRaw);
  const hasSearch =
    centerZip !== null ||
    props.maxBudgetNum !== null ||
    (props.bathroom && props.bathroom !== "any") ||
    Boolean(props.moveIn) ||
    Boolean(props.moveOut);

  const propertyResults = useMemo(
    () =>
      filterPropertiesForCatalog(combined, {
        zipRaw: props.zipRaw,
        radiusMiles: props.radiusMiles,
        maxBudgetNum: props.maxBudgetNum,
        bathroom: props.bathroom,
      }),
    [combined, props.bathroom, props.maxBudgetNum, props.radiusMiles, props.zipRaw],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Listings</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Available properties</h1>

      {hasSearch ? (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {centerZip !== null ? (
              <>
                <span className="font-semibold text-slate-900">ZIP {props.zipRaw}</span>
                <span className="text-slate-500"> · </span>
                <span>
                  Within <span className="font-semibold text-slate-900">{props.radiusMiles} mi</span> (demo)
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
            {propertyResults.length > 0 ? (
              <>
                <span className="text-slate-500"> · </span>
                <span className="font-semibold text-slate-900">
                  {propertyResults.length} propert{propertyResults.length === 1 ? "y" : "ies"}
                </span>
              </>
            ) : null}
          </p>
          <Link href="/rent/listings" className="shrink-0 text-sm font-semibold text-primary hover:opacity-90">
            Clear search
          </Link>
        </div>
      ) : null}

      {propertyResults.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
          <p className="text-base font-semibold text-slate-800">No properties match these filters</p>
          <p className="mt-2 text-sm text-slate-600">
            Try a larger radius, a nearby ZIP, a higher max rent, or set bathroom to Any (filters apply to rooms inside each listing).
          </p>
          <Link href="/rent/listings" className="mt-6 inline-flex text-sm font-semibold text-primary hover:opacity-90">
            View all properties
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {propertyResults.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      )}
    </div>
  );
}
