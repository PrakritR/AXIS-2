import Link from "next/link";
import { PropertyCard } from "@/components/marketing/property-card";
import { mockProperties } from "@/data/mock-properties";
import {
  parseRadiusParam,
  parseUSZip,
  propertyMatchesZipRadius,
  propertyWithinMaxBudget,
} from "@/lib/listings-search";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstString(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default async function ListingsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const zipRaw = firstString(sp.zip) ?? "";
  const centerZip = parseUSZip(zipRaw);
  const radiusMiles = parseRadiusParam(firstString(sp.radius));
  const moveIn = firstString(sp.moveIn) ?? "";
  const moveOut = firstString(sp.moveOut) ?? "";
  const maxBudgetRaw = firstString(sp.maxBudget);
  const maxBudgetNum =
    maxBudgetRaw != null && maxBudgetRaw !== "" && Number.isFinite(Number(maxBudgetRaw))
      ? Number(maxBudgetRaw)
      : null;
  const bathroom = firstString(sp.bathroom) ?? "any";

  const filtered = mockProperties.filter((p) => {
    const geoOk = centerZip === null ? true : propertyMatchesZipRadius(p.zip, zipRaw, radiusMiles);
    const budgetOk = propertyWithinMaxBudget(p.rentLabel, maxBudgetNum);
    return geoOk && budgetOk;
  });

  const hasSearch = centerZip !== null || maxBudgetNum !== null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Listings</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">View all properties</h1>

      {hasSearch ? (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {centerZip !== null ? (
              <>
                <span className="font-semibold text-slate-900">ZIP {zipRaw}</span>
                <span className="text-slate-500"> · </span>
                <span>
                  Within <span className="font-semibold text-slate-900">{radiusMiles} mi</span> (demo)
                </span>
              </>
            ) : (
              <span className="font-semibold text-slate-900">All ZIPs</span>
            )}
            {moveIn ? (
              <>
                <span className="text-slate-500"> · </span>
                Move-in {moveIn}
              </>
            ) : null}
            {moveOut ? (
              <>
                <span className="text-slate-500"> · </span>
                Move-out {moveOut}
              </>
            ) : null}
            {maxBudgetNum !== null ? (
              <>
                <span className="text-slate-500"> · </span>
                Max ${maxBudgetNum.toLocaleString()}/mo
              </>
            ) : null}
            {bathroom && bathroom !== "any" ? (
              <>
                <span className="text-slate-500"> · </span>
                Bath: {bathroom}
              </>
            ) : null}
          </p>
          <Link href="/rent/listings" className="shrink-0 text-sm font-semibold text-primary hover:opacity-90">
            Clear search
          </Link>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
          <p className="text-base font-semibold text-slate-800">No listings match these filters</p>
          <p className="mt-2 text-sm text-slate-600">
            Try a larger radius, a nearby ZIP, or a higher max rent (demo uses simple ZIP proximity and monthly rent on
            the card).
          </p>
          <Link href="/rent/listings" className="mt-6 inline-flex text-sm font-semibold text-primary hover:opacity-90">
            View all listings
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      )}
    </div>
  );
}
