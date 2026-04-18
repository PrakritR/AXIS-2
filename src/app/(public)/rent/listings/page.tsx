import Link from "next/link";
import { PropertyCard } from "@/components/marketing/property-card";
import { Toolbar } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { mockProperties } from "@/data/mock-properties";
import { parseRadiusParam, parseUSZip, propertyMatchesZipRadius } from "@/lib/listings-search";

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
  const maxBudget = firstString(sp.maxBudget);
  const bathroom = firstString(sp.bathroom) ?? "";

  const filtered =
    centerZip !== null
      ? mockProperties.filter((p) => propertyMatchesZipRadius(p.zip, zipRaw, radiusMiles))
      : mockProperties;

  const hasSearch = centerZip !== null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Listings</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Available homes (mock)</h1>
      <p className="mt-3 max-w-prose text-sm text-muted">
        ZIP + radius use a simple demo filter from the home search. Wire real geosearch when your API is ready.
      </p>

      {hasSearch ? (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-semibold text-slate-900">ZIP {zipRaw}</span>
            <span className="text-slate-500"> · </span>
            <span>
              Within <span className="font-semibold text-slate-900">{radiusMiles} mi</span> (demo)
            </span>
            {moveIn ? (
              <>
                <span className="text-slate-500"> · </span>
                Move-in {moveIn}
              </>
            ) : null}
            {maxBudget ? (
              <>
                <span className="text-slate-500"> · </span>
                Max ${Number(maxBudget).toLocaleString()}
              </>
            ) : null}
            {bathroom && bathroom !== "any" ? (
              <>
                <span className="text-slate-500"> · </span>
                Bath: {bathroom}
              </>
            ) : null}
          </p>
          <Link
            href="/rent/listings"
            className="shrink-0 text-sm font-semibold text-primary hover:opacity-90"
          >
            Clear location search
          </Link>
        </div>
      ) : null}

      <Toolbar>
        <Input
          className="md:max-w-[10rem]"
          placeholder="ZIP"
          name="zip"
          defaultValue={zipRaw}
          form="listings-filters"
        />
        <Select className="md:max-w-[9rem]" name="radius" defaultValue={String(radiusMiles)} form="listings-filters">
          <option value="5">5 mi</option>
          <option value="10">10 mi</option>
          <option value="15">15 mi</option>
          <option value="25">25 mi</option>
          <option value="50">50 mi</option>
        </Select>
        <Input className="md:max-w-md" placeholder="Search neighborhood, address, keyword…" />
        <Select className="md:max-w-xs">
          <option>Any price</option>
          <option>Under $1,000</option>
          <option>$1,000 – $1,400</option>
          <option>$1,400+</option>
        </Select>
        <Button type="submit" variant="outline" form="listings-filters">
          Apply ZIP / radius
        </Button>
        <Button type="button" variant="outline">
          More filters
        </Button>
      </Toolbar>

      <form id="listings-filters" className="hidden" action="/rent/listings" method="get" />

      {filtered.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
          <p className="text-base font-semibold text-slate-800">No listings in this radius</p>
          <p className="mt-2 text-sm text-slate-600">
            Try a larger radius or a nearby ZIP (demo uses numeric ZIP proximity, not map miles).
          </p>
          <Link
            href="/rent/listings"
            className="mt-6 inline-flex text-sm font-semibold text-primary hover:opacity-90"
          >
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
