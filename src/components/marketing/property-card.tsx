"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getListingRichContent } from "@/data/listing-rich-content";
import type { MockProperty } from "@/data/types";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";

const LISTING_PHOTO_IDS = [
  "1522708323590-d24dbb6b0267",
  "1560448204-e02f11c3d0e2",
  "1502672260266-1c1ef2d93688",
] as const;

function listingPhotoSrc(photoId: string) {
  return `https://images.unsplash.com/photo-${photoId}?w=800&q=80&auto=format&fit=crop`;
}

function ApplyDocGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function PropertyCard({ property }: { property: MockProperty }) {
  const listingPath = `/rent/listings/${property.id}`;
  const applyHref = buildRentalApplyHref({ propertyId: property.id });
  const rich = useMemo(() => getListingRichContent(property), [property]);
  const heroUrls = rich.heroHousePhotoUrls?.filter(Boolean) ?? [];
  const [slide, setSlide] = useState(0);
  const slideCount = heroUrls.length > 0 ? heroUrls.length : LISTING_PHOTO_IDS.length;

  useEffect(() => {
    setSlide(0);
  }, [property.id, heroUrls.length]);

  const slideSrc =
    heroUrls.length > 0
      ? heroUrls[slide % heroUrls.length]!
      : listingPhotoSrc(LISTING_PHOTO_IDS[slide % LISTING_PHOTO_IDS.length]!);

  const sharedHousing =
    /\bshared\b/i.test(property.tagline) || property.beds >= 5 || /\bco-?living\b/i.test(property.tagline);
  const title = `${property.buildingName} · ${property.unitLabel}`;
  const fullAddress = `${property.address}${property.zip ? `, ${property.zip}` : ""}`;
  const desc =
    property.tagline.trim().length > 0
      ? property.tagline.length > 140
        ? `${property.tagline.slice(0, 140)}…`
        : property.tagline
      : `${property.neighborhood} housing — see listing for rooms and pricing.`;

  const mid = useMemo(() => {
    const m = property.rentLabel.replace(/,/g, "").match(/\$(\d+)/);
    return m ? Number(m[1]) : 800;
  }, [property.rentLabel]);
  const rentLow2 = Math.max(400, mid - 75);
  const rentHigh2 = mid + 75;

  const tags = [sharedHousing ? "Shared housing" : null, property.neighborhood, "Seattle", property.petFriendly ? "Pet-friendly" : null].filter(
    Boolean,
  ) as string[];

  const go = (d: number) => setSlide((s) => (s + d + slideCount * 10) % slideCount);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_14px_44px_-34px_rgba(15,23,42,0.28)] transition duration-200 ease-out hover:border-primary/20 hover:shadow-[0_20px_54px_-36px_rgba(15,23,42,0.34)]">
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-200">
        <img src={slideSrc} alt={title} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        {sharedHousing ? (
          <div className="absolute left-3 top-3">
            <span className="inline-block rounded-full bg-black/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              Shared housing
            </span>
          </div>
        ) : null}
        <button
          type="button"
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:bg-white"
          onClick={() => go(-1)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Next photo"
          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:bg-white"
          onClick={() => go(1)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {Array.from({ length: slideCount }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Photo ${i + 1}`}
              className={`h-1.5 w-1.5 rounded-full transition ${i === slide ? "bg-white" : "bg-white/40"}`}
              onClick={() => setSlide(i)}
            />
          ))}
        </div>
        <div className="absolute bottom-3 right-3 text-right text-white drop-shadow-sm">
          <span className="text-[11px] font-medium opacity-90">from </span>
          <span className="text-lg font-bold">
            ${rentLow2}–${rentHigh2}
          </span>
          <span className="text-[11px] font-semibold">/mo</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div>
          <h3 className="text-lg font-bold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{fullAddress}</p>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400" aria-hidden>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 12h16v8H4v-8Zm2-4h12v4H6V8Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="font-medium">{rich.quickFacts.find((q) => q.label === "Bedrooms")?.value ?? property.beds} bedrooms</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400" aria-hidden>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 4h12v16H6V4Zm3 4h6M9 14h6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="font-medium">{rich.quickFacts.find((q) => q.label === "Bathrooms")?.value ?? property.baths} bathrooms</span>
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <Link href={listingPath} className="contents">
            <Button
              type="button"
              className="w-full justify-center gap-2 text-[13px] sm:text-sm"
              style={{
                background: "linear-gradient(135deg, var(--primary), var(--primary-alt))",
                boxShadow: "0 4px 18px rgba(0,122,255,0.28)",
              }}
            >
              View listing
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/rent/tours-contact" className="contents">
              <Button type="button" variant="outline" className="w-full text-[12px] sm:text-sm">
                Schedule tour
              </Button>
            </Link>
            <Link href={applyHref} className="contents">
              <Button type="button" variant="outline" className="inline-flex w-full items-center justify-center gap-1.5 text-[12px] sm:text-sm">
                <ApplyDocGlyph className="h-3.5 w-3.5" />
                Apply
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
