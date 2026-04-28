"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type MouseEvent } from "react";
import type { RoomListingRow } from "@/lib/room-listings-catalog";
import { roomAvailabilityTextClasses, roomAvailabilityTone } from "@/lib/room-availability-style";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";

const SLIDE_GRADS = [
  "from-slate-600 via-slate-700 to-slate-900",
  "from-sky-600 via-blue-800 to-indigo-950",
  "from-teal-600 via-emerald-800 to-slate-900",
  "from-violet-600 via-purple-800 to-slate-950",
  "from-amber-600 via-orange-800 to-stone-900",
  "from-slate-500 via-slate-600 to-zinc-900",
] as const;

function slidesForKey(key: string): readonly string[] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i) * (i + 1)) % 997;
  const a = SLIDE_GRADS[h % SLIDE_GRADS.length]!;
  const b = SLIDE_GRADS[(h + 2) % SLIDE_GRADS.length]!;
  const c = SLIDE_GRADS[(h + 4) % SLIDE_GRADS.length]!;
  return [a, b, c];
}

function BedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 10V19M3 10h18v4H3V10Zm0 0V7a1 1 0 0 1 1-1h4v4M21 14v5M7 6h10v4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BathIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 20h12M4 14h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3Zm2-4V8a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v2M14 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ApplyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 12h6M9 16h6M7 4h10l2 16H5L7 4Zm2 0V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1v1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RoomListingCard({ row }: { row: RoomListingRow }) {
  const listingHref = `/rent/listings/${row.propertyId}`;
  const applyHref = buildRentalApplyHref({
    propertyId: row.propertyId,
    listingRoomId: row.roomId,
    listingRoomName: row.roomName,
    floorLabel: row.floorLabel,
    roomPrice: row.priceLabel,
  });

  const slides = useMemo(() => slidesForKey(row.key), [row.key]);
  const [slideIdx, setSlideIdx] = useState(0);
  const n = slides.length;

  const prev = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setSlideIdx((i) => (i - 1 + n) % n);
    },
    [n],
  );
  const next = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setSlideIdx((i) => (i + 1) % n);
    },
    [n],
  );

  const bedLabel =
    row.propertyBeds === 0 ? "Studio" : `${row.propertyBeds} bedroom${row.propertyBeds === 1 ? "" : "s"}`;
  const availabilityTone = roomAvailabilityTone(row.availabilityRaw);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_40px_-18px_rgba(15,23,42,0.2)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-14px_rgba(15,23,42,0.25)]">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-slate-200">
        {slides.map((grad, i) => (
          <div
            key={grad + i}
            className={`absolute inset-0 bg-gradient-to-br ${grad} transition-opacity duration-500 ease-out ${
              i === slideIdx ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden
          />
        ))}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" aria-hidden />

        <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-900 shadow-sm ring-1 ring-black/5">
          Room rental
        </span>

        <div className="pointer-events-none absolute bottom-3 right-3 text-right text-white drop-shadow-md">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/90">from</p>
          <p className="text-2xl font-bold leading-none tracking-tight">
            {row.priceLabel.replace("/month", "").replace("/mo", "").trim()}
            <span className="text-sm font-semibold text-white/90"> /mo</span>
          </p>
        </div>

        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Photo ${i + 1} of ${n}`}
              className={`h-1.5 rounded-full transition-all ${i === slideIdx ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSlideIdx(i);
              }}
            />
          ))}
        </div>

        <button
          type="button"
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-white/90 text-slate-700 shadow-md backdrop-blur-sm transition hover:bg-white"
          onClick={prev}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next photo"
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-white/90 text-slate-700 shadow-md backdrop-blur-sm transition hover:bg-white"
          onClick={next}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
        <h2 className="text-lg font-bold leading-snug tracking-tight text-slate-900">{row.roomName}</h2>
        <p className="mt-0.5 text-sm font-medium text-slate-700">{row.title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{row.headlineAddress}</p>

        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <BedIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <span>{bedLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BathIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <span>{row.bathroomHint}</span>
          </span>
        </p>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600">{row.descriptionBlurb}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {row.listingTags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200/80">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <Link
            href={listingHref}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_4px_20px_-4px_rgba(0,122,255,0.45)] transition hover:opacity-95"
          >
            View listing
            <ChevronRight className="h-4 w-4 shrink-0 opacity-95" />
          </Link>
          <Link
            href={applyHref}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:min-w-[7.5rem]"
          >
            <ApplyIcon className="h-4 w-4 text-slate-500" />
            Apply
          </Link>
        </div>

        <p
          className={`mt-3 text-center text-[11px] font-medium sm:text-left ${roomAvailabilityTextClasses(availabilityTone)}`}
        >
          {row.availabilityLabel}
        </p>
      </div>
    </article>
  );
}
