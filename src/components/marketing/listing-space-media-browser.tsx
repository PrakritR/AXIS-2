"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import {
  listingLinkTargetProps,
  useListingPreviewNewTab,
} from "@/components/marketing/listing-preview-context";
import { roomAvailabilityPillClasses, roomAvailabilityTone } from "@/lib/room-availability-style";
import { NoImagePlaceholder } from "@/components/ui/no-image-placeholder";

export type ListingSpaceMediaEntry = {
  id: string;
  eyebrow: string;
  title: string;
  metaLine?: string;
  availability?: string;
  photoUrls?: string[];
  videoSrc?: string | null;
  thumbLabel: string;
};

export type ListingSpaceMediaCta =
  | { kind: "link"; href: string; label: string; dataAttr: string }
  | { kind: "button"; label: string; dataAttr: string; onClick: () => void };

const SWIPE_THRESHOLD_PX = 48;

const ctaClass =
  "flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(47,107,255,0.28)] transition hover:opacity-95";
const secondaryCtaClass =
  "flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-accent/30";

function AvailabilityPill({ text, variant = "room" }: { text: string; variant?: "room" | "default" }) {
  if (variant === "room") {
    const tone = roomAvailabilityTone(text);
    const { wrap, dot } = roomAvailabilityPillClasses(tone);
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 sm:text-xs ${wrap}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        {text}
      </span>
    );
  }
  const green = text.toLowerCase().includes("available") || text.toLowerCase().includes("shared");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)] sm:text-xs ${
        green ? "portal-badge-success" : "border border-border bg-accent/35 text-foreground"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${green ? "bg-emerald-500" : "bg-muted"}`} />
      {text}
    </span>
  );
}

function SpaceMediaCtaButton({
  cta,
  className,
  newTabProps,
}: {
  cta: ListingSpaceMediaCta;
  className: string;
  newTabProps: ReturnType<typeof listingLinkTargetProps>;
}) {
  if (cta.kind === "button") {
    return (
      <button type="button" className="flex-1" data-attr={cta.dataAttr} onClick={cta.onClick}>
        <span className={className}>{cta.label}</span>
      </button>
    );
  }
  if (cta.href.startsWith("sms:")) {
    return (
      <a href={cta.href} className="flex-1" data-attr={cta.dataAttr}>
        <span className={className}>{cta.label}</span>
      </a>
    );
  }
  return (
    <Link href={cta.href} className="flex-1" data-attr={cta.dataAttr} {...newTabProps}>
      <span className={className}>{cta.label}</span>
    </Link>
  );
}

export function ListingSpaceMediaBrowser({
  entries,
  testId,
  itemNoun = "space",
  availabilityVariant = "room",
  primaryCta,
  secondaryCta,
  resolvePrimaryCta,
  resolveSecondaryCta,
  className = "",
}: {
  entries: ListingSpaceMediaEntry[];
  testId: string;
  itemNoun?: string;
  availabilityVariant?: "room" | "default";
  primaryCta?: ListingSpaceMediaCta;
  secondaryCta?: ListingSpaceMediaCta;
  resolvePrimaryCta?: (entry: ListingSpaceMediaEntry, index: number) => ListingSpaceMediaCta;
  resolveSecondaryCta?: (entry: ListingSpaceMediaEntry, index: number) => ListingSpaceMediaCta;
  className?: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const newTabProps = listingLinkTargetProps(useListingPreviewNewTab());

  const safeIndex = entries.length ? Math.min(selectedIndex, entries.length - 1) : 0;
  const entry = entries[safeIndex];
  const photos = entry?.photoUrls ?? [];
  const videoSrc = entry?.videoSrc?.trim() || null;
  const hasVideo = Boolean(videoSrc);
  const photoCount = photos.length;
  const safePhotoIndex = photoCount ? Math.min(photoIndex, photoCount - 1) : 0;

  const selectEntry = useCallback(
    (index: number) => {
      if (index < 0 || index >= entries.length) return;
      setSelectedIndex(index);
      setPhotoIndex(0);
    },
    [entries.length],
  );

  const goEntry = useCallback(
    (delta: number) => {
      if (entries.length <= 1) return;
      selectEntry((safeIndex + delta + entries.length) % entries.length);
    },
    [entries.length, safeIndex, selectEntry],
  );

  const goPhoto = useCallback(
    (delta: number) => {
      if (photoCount <= 1) return;
      setPhotoIndex((i) => (i + delta + photoCount) % photoCount);
    },
    [photoCount],
  );

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    goEntry(delta < 0 ? 1 : -1);
  };

  if (entries.length === 0) return null;

  const activePrimary = entry
    ? resolvePrimaryCta?.(entry, safeIndex) ?? primaryCta
    : primaryCta;
  const activeSecondary = entry
    ? resolveSecondaryCta?.(entry, safeIndex) ?? secondaryCta
    : secondaryCta;
  if (!activePrimary || !activeSecondary) return null;

  const heroShowsVideo = hasVideo;
  const heroPhotoUrl = !heroShowsVideo && photoCount > 0 ? photos[safePhotoIndex]! : null;

  const thumbForEntry = (e: ListingSpaceMediaEntry) => {
    const firstPhoto = e.photoUrls?.[0];
    if (firstPhoto) return { kind: "photo" as const, src: firstPhoto };
    if (e.videoSrc?.trim()) return { kind: "video" as const, src: null };
    return { kind: "empty" as const, src: null };
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-card shadow-sm listing-detail-surface ${className}`}
      data-testid={testId}
    >
      <div
        className="relative aspect-[4/3] w-full overflow-hidden bg-accent/25"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {heroShowsVideo ? (
          <video
            key={videoSrc}
            src={videoSrc!}
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            controls
          />
        ) : heroPhotoUrl ? (
          <Image
            key={heroPhotoUrl}
            src={heroPhotoUrl}
            alt=""
            fill
            className="object-cover"
            unoptimized
            sizes="(max-width: 768px) 100vw, 60vw"
          />
        ) : (
          <NoImagePlaceholder />
        )}

        {entries.length > 1 ? (
          <>
            <button
              type="button"
              aria-label={`Previous ${itemNoun}`}
              className="listing-photo-chip absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/95 shadow-md transition hover:bg-card"
              onClick={() => goEntry(-1)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={`Next ${itemNoun}`}
              className="listing-photo-chip absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/95 shadow-md transition hover:bg-card"
              onClick={() => goEntry(1)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        ) : null}

        {!heroShowsVideo && photoCount > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              className="listing-photo-chip absolute bottom-3 left-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
              onClick={() => goPhoto(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next photo"
              className="listing-photo-chip absolute bottom-3 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
              onClick={() => goPhoto(1)}
            >
              ›
            </button>
            <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
              {safePhotoIndex + 1} / {photoCount}
            </div>
          </>
        ) : null}

        {entry ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-4 pb-3 pt-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">{entry.eyebrow}</p>
            <p className="mt-0.5 text-lg font-bold text-white">{entry.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {entry.metaLine ? <span className="text-sm font-semibold text-white">{entry.metaLine}</span> : null}
              {entry.availability ? (
                <AvailabilityPill text={entry.availability} variant={availabilityVariant} />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {entries.length > 1 ? (
        <div className="border-t border-border/60 px-3 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {entries.map((e, i) => {
              const thumb = thumbForEntry(e);
              const active = i === safeIndex;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => selectEntry(i)}
                  className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                    active ? "border-primary ring-2 ring-primary/25" : "border-border opacity-80 hover:opacity-100"
                  }`}
                  aria-label={`View ${e.title}`}
                  aria-current={active ? "true" : undefined}
                >
                  {thumb.kind === "photo" && thumb.src ? (
                    <Image src={thumb.src} alt="" fill className="object-cover" unoptimized sizes="80px" />
                  ) : thumb.kind === "video" ? (
                    <div className="flex h-full w-full items-center justify-center bg-accent/50 text-lg text-muted">▶</div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-accent/35 text-[10px] font-medium text-muted">
                      No media
                    </div>
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[9px] font-semibold text-white">
                    {e.thumbLabel}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
            {entries.map((e, i) => (
              <span
                key={e.id}
                className={`h-1.5 rounded-full transition-all ${i === safeIndex ? "w-4 bg-primary" : "w-1.5 bg-border"}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border/60 px-4 py-3 sm:flex-row">
        <SpaceMediaCtaButton cta={activePrimary} className={ctaClass} newTabProps={newTabProps} />
        <SpaceMediaCtaButton cta={activeSecondary} className={secondaryCtaClass} newTabProps={newTabProps} />
      </div>
    </div>
  );
}
