"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PropertyDetailActions } from "@/components/marketing/property-detail-actions";
import { ListingStickySubnav } from "@/components/marketing/listing-detail-subnav";
import { ListingLocationBlock } from "@/components/marketing/listing-location-block";
import {
  AmenitiesTableInteractive,
  BathroomTableInteractive,
  BundleTableInteractive,
  InteractiveFloorPlanCard,
  LeaseBasicsTableInteractive,
  SharedTableInteractive,
} from "@/components/marketing/listing-detail-tables-client";
import { listingFallbackMapCenter } from "@/lib/listing-map";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import type { MockProperty } from "@/data/types";
import { DEFAULT_LISTING_HOUSE_RULES_FALLBACK, type ListingRichContent } from "@/data/listing-rich-content";

const sectionScroll =
  "scroll-mt-[var(--listing-sticky-stack,calc(env(safe-area-inset-top,0px)+8.75rem))]";

function ListingHeroPhotoGrid({
  urls,
  priceRangeLabel,
}: {
  urls: string[];
  priceRangeLabel: string;
}) {
  const [slide, setSlide] = useState(0);
  const n = urls.length;
  useEffect(() => {
    setSlide(0);
  }, [urls.join("|")]);

  const mainUrl = n ? urls[slide % n]! : null;
  const side1 = n > 1 ? urls[1]! : null;
  const side2 = n > 2 ? urls[2]! : null;

  const go = (delta: number) => {
    if (n <= 1) return;
    setSlide((s) => (s + delta + n) % n);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200 shadow-sm">
        {mainUrl ? (
          <img src={mainUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {n > 0 ? (
          <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm sm:right-4 sm:top-4 sm:px-3 sm:text-xs">
            {n > 1 ? `${slide + 1} / ${n}` : "1 / 1"}
          </div>
        ) : (
          <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm sm:right-4 sm:top-4 sm:px-3 sm:text-xs">
            Gallery
          </div>
        )}
        <div className="absolute bottom-3 right-3 max-w-[min(100%,14rem)] truncate rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-md backdrop-blur-sm sm:bottom-4 sm:right-4 sm:max-w-none sm:px-4 sm:py-2 sm:text-sm">
          {priceRangeLabel}
        </div>
        <div className="aspect-[4/3] w-full" />
        {n > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:bg-white"
              onClick={() => go(-1)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next photo"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:bg-white"
              onClick={() => go(1)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        ) : null}
      </div>
      <div className="grid grid-rows-2 gap-4">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-sm">
          {side1 ? (
            <img src={side1} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          <div className="aspect-[16/10] h-full min-h-[120px] w-full lg:aspect-auto lg:min-h-0" />
        </div>
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
          {side2 ? (
            <img src={side2} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          <div className="aspect-[16/10] h-full min-h-[120px] w-full lg:aspect-auto lg:min-h-0" />
        </div>
      </div>
    </div>
  );
}

function formatBoldSegments(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

const primaryCtaClass =
  "mt-5 flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold text-white outline-none transition hover:-translate-y-[1px] active:translate-y-0";
const primaryCtaStyle = {
  background: "linear-gradient(135deg, #007aff, #339cff)",
  boxShadow: "0 4px 20px rgba(0,122,255,0.3)",
};

function Sidebar({
  property,
  rich,
  className = "",
}: {
  property: MockProperty;
  rich: ListingRichContent;
  className?: string;
}) {
  const primaryPrice = rich.estimatedMonthlyTotalLabel ?? rich.startingRentLabel;
  const showsEstimatedTotal = Boolean(rich.estimatedMonthlyTotalLabel);
  return (
    <aside
      className={`order-1 space-y-6 lg:order-2 lg:sticky lg:top-[calc(env(safe-area-inset-top,0px)+7.5rem)] lg:self-start ${className}`}
    >
      <Card className="p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          {showsEstimatedTotal ? "Estimated monthly from" : "Base rent from"}
        </p>
        <p className="mt-1 text-4xl font-bold text-primary">{primaryPrice}</p>
        <p className="text-sm text-slate-500">
          {showsEstimatedTotal ? `Includes rent + utilities estimate. Base rent from ${rich.startingRentLabel}.` : "Before utilities and other fees."}
        </p>
        <Link
          href="/rent/tours-contact"
          className={`${primaryCtaClass} min-h-[48px]`}
          style={primaryCtaStyle}
        >
          Check availability
        </Link>
        <Link
          href={buildRentalApplyHref({ propertyId: property.id })}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-full border border-black/[0.1] bg-white/80 py-3 text-sm font-semibold text-[#1d1d1f] outline-none transition hover:bg-black/[0.04]"
        >
          Apply online
        </Link>
      </Card>
      <Card className="p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Quick facts
        </p>
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {rich.quickFacts.map((q) => (
            <li
              key={q.label}
              className="flex justify-between gap-4 py-3 first:pt-0"
            >
              <span className="text-slate-500">{q.label}</span>
              <span className="font-semibold text-slate-900">{q.value}</span>
            </li>
          ))}
        </ul>
      </Card>
    </aside>
  );
}

export function ListingDetailSections({
  property,
  rich,
  previewModal = false,
}: {
  property: MockProperty;
  rich: ListingRichContent;
  /** When true (public preview dialog), section tabs sit at the top and stick within the modal scroller. */
  previewModal?: boolean;
}) {
  const roomCount = rich.floorPlans.reduce((n, f) => n + f.rooms.length, 0);
  const houseRulesDisplay =
    rich.houseRulesBody?.trim() ||
    (!property.listingSubmission ? DEFAULT_LISTING_HOUSE_RULES_FALLBACK : null);
  const heroUrls = rich.heroHousePhotoUrls ?? [];
  return (
    <div className="bg-[#f4f7fb]">
      <div className={`mx-auto max-w-6xl px-4 ${previewModal ? "pb-8 pt-2 sm:pb-10 sm:pt-3" : "py-8 sm:py-10"}`}>
        {previewModal ? <ListingStickySubnav mode="modal" /> : null}
        <ListingHeroPhotoGrid urls={heroUrls} priceRangeLabel={rich.priceRangeLabel} />

        <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge tone="info">{property.neighborhood}</Badge>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
              {property.title}
            </h1>
            <p className="mt-2 text-slate-600">{property.address}</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
              {rich.heroTagline}
            </p>
            {rich.heroOverview ? (
              <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                {formatBoldSegments(rich.heroOverview)}
              </p>
            ) : null}
            <p className="mt-4 text-sm text-slate-500">
              {property.beds} bed{property.beds !== 1 ? "s" : ""} ·{" "}
              {property.baths} bath{property.baths !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className={previewModal ? "mt-4" : "mt-6"}>
          {previewModal ? null : <ListingStickySubnav />}

          <div className={`relative z-0 grid gap-10 lg:grid-cols-[1fr_minmax(280px,320px)] ${previewModal ? "mt-6" : "mt-10"}`}>
            <div className="order-2 space-y-14 lg:order-1">
              <section id="floor-plans" className={sectionScroll}>
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    {rich.floorPlansSectionTitle ?? "Floor plans"}
                  </h2>
                  <p className="text-xs font-medium text-slate-500 sm:text-sm">
                    {roomCount} rooms listed
                  </p>
                </div>
                <div className="space-y-5">
                  {rich.floorPlans.map((f) => (
                    <InteractiveFloorPlanCard
                      key={f.cardKey ?? f.floorLabel}
                      floor={f}
                      listingPropertyId={property.id}
                    />
                  ))}
                </div>

                <div className="mt-8 rounded-2xl border border-slate-200/80 bg-white/60 p-4 shadow-sm sm:mt-10 sm:p-5">
                  <h3 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                    Bathrooms
                  </h3>
                  <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                    Fixtures are summarized under{" "}
                    <span className="font-semibold text-slate-800">Info</span>.
                    Open the{" "}
                    <span className="font-semibold text-slate-800">
                      Details
                    </span>{" "}
                    button for photos and setup notes.
                  </p>
                  <div className="mt-4 md:overflow-x-auto sm:mt-5">
                    <BathroomTableInteractive
                      rows={rich.bathrooms}
                      listingPropertyId={property.id}
                    />
                  </div>
                </div>

                <div
                  id="listing-shared"
                  className={`${sectionScroll} mt-8 rounded-2xl border border-slate-200/80 bg-white/60 p-4 shadow-sm sm:mt-10 sm:p-5`}
                >
                  <h3 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                    Shared spaces
                  </h3>
                  <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                    Laundry, kitchen, living areas, and more. Open{" "}
                    <span className="font-semibold text-slate-800">Details</span> for the full description, room access,
                    amenities, and photos.
                  </p>
                  <div className="mt-4 md:overflow-x-auto sm:mt-5">
                    <SharedTableInteractive
                      rows={rich.sharedSpaces}
                      listingPropertyId={property.id}
                    />
                  </div>
                </div>
              </section>

              <section id="lease-basics" className={sectionScroll}>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">
                    Lease basics
                  </h2>
                  <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                    Each line is a quick summary. Open{" "}
                    <span className="font-semibold text-slate-800">
                      Details
                    </span>{" "}
                    for the full explanation and next steps.
                  </p>
                  <div className="mt-5 md:overflow-x-auto">
                    <LeaseBasicsTableInteractive
                      rows={rich.leaseBasics}
                      listingPropertyId={property.id}
                    />
                  </div>
                </div>
              </section>

              <section id="amenities" className={sectionScroll}>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">
                    Amenities
                  </h2>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Building-wide & neighborhood
                  </p>
                  <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                    Kitchen appliances, shared desks, and bathroom finishes are listed under{" "}
                    <span className="font-semibold text-slate-800">Shared spaces</span> and{" "}
                    <span className="font-semibold text-slate-800">Bathrooms</span> above. Use{" "}
                    <span className="font-semibold text-slate-800">Details</span> on a row for more context.
                  </p>
                  <div className="mt-5 md:overflow-x-auto">
                    <AmenitiesTableInteractive
                      rows={rich.amenities}
                      listingPropertyId={property.id}
                    />
                  </div>
                </div>
              </section>

              <section id="bundles" className={sectionScroll}>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                        Pricing packages
                      </p>
                      <h2 className="mt-1 text-xl font-bold tracking-tight text-[#0f172a]">
                        Bundles & leasing
                      </h2>
                      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-600 sm:text-sm">
                        Compare grouped leases at a glance. Each card rolls up rooms, rent, utilities context, and signing
                        charges — open <span className="font-semibold text-slate-800">Details</span> for the full breakdown.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                        {rich.bundleCards.length} package{rich.bundleCards.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5">
                    <BundleTableInteractive
                      rows={rich.bundleCards}
                      listingPropertyId={property.id}
                    />
                  </div>
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Lease lengths
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      {formatBoldSegments(rich.bundlesText)}
                    </p>
                  </div>
                </div>
              </section>

              <section id="house-rules" className={sectionScroll}>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <h2 className="text-xl font-bold tracking-tight text-[#0f172a]">House rules</h2>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Community guidelines
                  </p>
                  {houseRulesDisplay ? (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{houseRulesDisplay}</p>
                  ) : (
                    <p className="mt-4 text-sm leading-relaxed text-slate-500">
                      No house rules were added to this listing yet. Ask the property manager during your tour or application.
                    </p>
                  )}
                </div>
              </section>

              <section id="location" className={sectionScroll}>
                <ListingLocationBlock
                  {...listingFallbackMapCenter(property)}
                  address={property.address}
                />
              </section>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-slate-800">
                  Ready to apply?
                </p>
                <div className="mt-4">
                  <PropertyDetailActions propertyId={property.id} />
                </div>
              </div>
            </div>

            <Sidebar property={property} rich={rich} />
          </div>
        </div>
      </div>
    </div>
  );
}
