"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AmenityItem,
  BundleCard,
  LeaseBasicRow,
  ListingBathroomRow,
  ListingFloorCard,
  ListingRoomRow,
  ListingSharedRow,
} from "@/data/listing-rich-content";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";

function AvailabilityPill({ text }: { text: string }) {
  const t = text.toLowerCase();
  const green = t.includes("available") || t.includes("included");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs ${
        green ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80"
      }`}
    >
      <span className={`h-1 w-1 shrink-0 rounded-full sm:h-1.5 sm:w-1.5 ${green ? "bg-emerald-500" : "bg-slate-400"}`} />
      {text}
    </span>
  );
}

function formatBathroomIncludes(r: ListingBathroomRow): string {
  const parts: string[] = [];
  if (r.shower) parts.push("Shower");
  if (r.toilet) parts.push("Toilet");
  if (r.bathtub) parts.push("Bathtub");
  return parts.length ? parts.join(", ") : "—";
}

function DetailsButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:border-primary hover:text-primary sm:min-h-0 ${className}`}
    >
      Details
    </button>
  );
}

function ModalVideoBlock({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-sm">▶</span>
        {eyebrow}
      </div>
      <div className="flex aspect-video flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-slate-950 px-6 text-center text-white">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/40 text-2xl text-white/90">▶</div>
        <p className="mt-4 text-sm font-semibold">{title}</p>
        <p className="mt-1 max-w-sm text-xs text-white/60">{subtitle}</p>
      </div>
    </div>
  );
}

function PhotoStrip({ captions, imageUrls }: { captions?: string[]; imageUrls?: string[] }) {
  const imgs = imageUrls?.filter(Boolean) ?? [];
  if (imgs.length > 0) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {imgs.map((src, i) => (
          <div key={`${src.slice(0, 48)}-${i}`} className="overflow-hidden rounded-xl bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="aspect-[4/3] h-full w-full object-cover" />
          </div>
        ))}
      </div>
    );
  }
  const caps = captions ?? [];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {caps.map((cap) => (
        <div
          key={cap}
          className="flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 p-2"
        >
          <p className="text-[11px] font-semibold text-slate-800">{cap}</p>
        </div>
      ))}
    </div>
  );
}

type ModalState =
  | { kind: "room"; room: ListingRoomRow; floorLabel: string }
  | { kind: "bathroom"; row: ListingBathroomRow }
  | { kind: "shared"; row: ListingSharedRow }
  | { kind: "lease"; row: LeaseBasicRow }
  | { kind: "bundle"; row: BundleCard }
  | { kind: "amenity"; row: AmenityItem }
  | null;

function ListingDetailModal({
  state,
  onClose,
  listingPropertyId,
}: {
  state: ModalState;
  onClose: () => void;
  listingPropertyId: string;
}) {
  const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!state) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state]);

  if (!state) return null;
  if (!mounted || typeof document === "undefined") return null;

  const panel = (
    <div className="fixed inset-0 z-[240] flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]" onClick={onClose} aria-label="Close dialog" />
      <div
        className="relative z-10 max-h-[min(92vh,820px)] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl sm:max-w-2xl"
        onClick={stop}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg text-slate-600 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-slate-50"
          aria-label="Close"
        >
          ×
        </button>

        {state.kind === "room" ? (
          <div className="p-6 pb-8 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{state.floorLabel.toUpperCase()}</p>
            <h2 className="mt-1 pr-10 text-2xl font-bold tracking-tight text-slate-900">{state.room.name}</h2>
            <p className="mt-2 text-sm text-slate-600">{state.room.detail}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Monthly rent</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{state.room.price}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Bathroom setup</p>
                <p className="mt-2 text-sm font-medium leading-snug text-slate-800">{state.room.modal.setupLine}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Status</p>
                <div className="mt-2">
                  <AvailabilityPill text={state.room.availability} />
                </div>
              </div>
            </div>
            {(state.room.modal.photoUrls?.length ?? 0) > 0 ? (
              <div className="mt-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Photos</p>
                <div className="mt-3">
                  <PhotoStrip imageUrls={state.room.modal.photoUrls} />
                </div>
              </div>
            ) : null}
            <div className="mt-6">
              {state.room.modal.videoSrc ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-sm">
                  <video
                    src={state.room.modal.videoSrc}
                    controls
                    playsInline
                    className="max-h-[min(55vh,420px)] w-full"
                  />
                </div>
              ) : (
                <ModalVideoBlock
                  eyebrow={state.room.modal.tourEyebrow}
                  title={state.room.modal.tourTitle}
                  subtitle={state.room.modal.tourSubtitle}
                />
              )}
            </div>
            <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">What&apos;s included</p>
              <p className="mt-1 text-sm text-slate-600">This room includes the following features:</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {state.room.modal.includedTags.map((t) => (
                  <span key={t} className="rounded-full border border-sky-200/90 bg-white px-3 py-1 text-xs font-medium text-slate-800">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            {state.room.modal.furnishingDetail ? (
              <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/70 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-950/90">Furnishing</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{state.room.modal.furnishingDetail}</p>
              </div>
            ) : null}
            {state.room.modal.roomAmenityLabels?.length ? (
              <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-950/90">Room amenities</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {state.room.modal.roomAmenityLabels.map((t) => (
                    <span key={t} className="rounded-full border border-violet-200/90 bg-white px-3 py-1 text-xs font-medium text-slate-800">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Link
                href={buildRentalApplyHref({
                  propertyId: listingPropertyId,
                  listingRoomId: state.room.id,
                  listingRoomName: state.room.name,
                  floorLabel: state.floorLabel,
                  roomPrice: state.room.price,
                })}
                className="flex-1"
              >
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,122,255,0.28)] transition hover:opacity-95">
                  Apply for this room
                </span>
              </Link>
              <Link href="/rent/tours-contact" className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50">
                  Ask a question
                </span>
              </Link>
            </div>
          </div>
        ) : null}

        {state.kind === "bathroom" ? (
          <div className="p-6 pb-8 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{state.row.modal.eyebrow}</p>
            <h2 className="mt-1 pr-10 text-2xl font-bold tracking-tight text-slate-900">{state.row.name}</h2>
            <p className="mt-2 text-sm text-slate-600">{state.row.detail}</p>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Setup</p>
              <p className="mt-2 text-sm font-medium leading-snug text-slate-800">{state.row.modal.setupCard}</p>
            </div>
            <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Info</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {state.row.modal.includedTags.map((t) => (
                  <span key={t} className="rounded-full border border-sky-200/90 bg-white px-3 py-1 text-xs font-medium text-slate-800">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Photos</p>
              <div className="mt-3">
                <PhotoStrip captions={state.row.modal.photoCaptions} />
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Link href="/rent/tours-contact" className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,122,255,0.28)] transition hover:opacity-95">
                  Ask about this bathroom
                </span>
              </Link>
              <Link href={buildRentalApplyHref({ propertyId: listingPropertyId })} className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50">
                  Apply
                </span>
              </Link>
            </div>
          </div>
        ) : null}

        {state.kind === "shared" ? (
          <div className="p-6 pb-8 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{state.row.modal.eyebrow}</p>
            <h2 className="mt-1 pr-10 text-2xl font-bold tracking-tight text-slate-900">{state.row.name}</h2>
            <p className="mt-2 text-sm text-slate-600">{state.row.detail}</p>
            <p className="mt-1 text-sm text-slate-500">{state.row.useNote}</p>
            <div className="mt-6">
              <ModalVideoBlock
                eyebrow={state.row.modal.tourEyebrow}
                title={state.row.modal.tourTitle}
                subtitle={state.row.modal.tourSubtitle}
              />
            </div>
            <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">What&apos;s included</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {state.row.modal.includedTags.map((t) => (
                  <span key={t} className="rounded-full border border-sky-200/90 bg-white px-3 py-1 text-xs font-medium text-slate-800">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Photos</p>
              <div className="mt-3">
                <PhotoStrip captions={state.row.modal.photoCaptions} />
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Link href={buildRentalApplyHref({ propertyId: listingPropertyId })} className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,122,255,0.28)] transition hover:opacity-95">
                  Apply
                </span>
              </Link>
              <Link href="/rent/tours-contact" className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50">
                  Ask a question
                </span>
              </Link>
            </div>
          </div>
        ) : null}

        {state.kind === "lease" ? (
          <div className="p-6 pb-8 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Lease</p>
            <div className="mt-2 flex items-start gap-3">
              <span className="text-3xl leading-none" aria-hidden>
                {state.row.icon}
              </span>
              <div className="min-w-0">
                <h2 className="pr-10 text-2xl font-bold tracking-tight text-slate-900">{state.row.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{state.row.detail}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Amount / rate</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{state.row.price}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Timing</p>
                <div className="mt-2">
                  <AvailabilityPill text={state.row.status} />
                </div>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Details</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{state.row.body}</p>
            </div>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Link href={buildRentalApplyHref({ propertyId: listingPropertyId })} className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,122,255,0.28)] transition hover:opacity-95">
                  Apply
                </span>
              </Link>
              <Link href="/rent/tours-contact" className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50">
                  Ask about lease terms
                </span>
              </Link>
            </div>
          </div>
        ) : null}

        {state.kind === "bundle" ? (
          <div className="p-6 pb-8 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Bundle</p>
            <h2 className="mt-1 pr-10 text-2xl font-bold tracking-tight text-slate-900">{state.row.label}</h2>
            <div className="mt-4 flex flex-wrap items-baseline gap-2">
              {state.row.strikethrough ? <span className="text-sm text-slate-400 line-through">{state.row.strikethrough}</span> : null}
              <span className="text-2xl font-bold text-slate-900">{state.row.price}</span>
              {state.row.promo ? <AvailabilityPill text={state.row.promo} /> : null}
            </div>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Rooms & scope</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-800">{state.row.roomsLine}</p>
            </div>
            <p className="mt-4 text-xs text-slate-500">Demo pricing — confirm availability and final rent with leasing.</p>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Link href={buildRentalApplyHref({ propertyId: listingPropertyId })} className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,122,255,0.28)] transition hover:opacity-95">
                  Apply for this bundle
                </span>
              </Link>
              <Link href="/rent/tours-contact" className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50">
                  Ask a question
                </span>
              </Link>
            </div>
          </div>
        ) : null}

        {state.kind === "amenity" ? (
          <div className="p-6 pb-8 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Amenity</p>
            <div className="mt-2 flex items-start gap-3">
              <span className="text-3xl leading-none" aria-hidden>
                {state.row.icon}
              </span>
              <h2 className="pr-10 text-2xl font-bold tracking-tight text-slate-900">{state.row.label}</h2>
            </div>
            <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">About</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                This feature is included with the listing as described. Confirm specifics with the leasing team before you apply.
              </p>
            </div>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Link href="/rent/tours-contact" className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,122,255,0.28)] transition hover:opacity-95">
                  Ask a question
                </span>
              </Link>
              <Link href={buildRentalApplyHref({ propertyId: listingPropertyId })} className="flex-1">
                <span className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50">
                  Apply
                </span>
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

export function InteractiveFloorPlanCard({ floor, listingPropertyId }: { floor: ListingFloorCard; listingPropertyId: string }) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 sm:pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{floor.floorLabel}</p>
            <p className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{floor.fromPrice}</p>
            {floor.remainingNote ? (
              <p className="mt-1.5 flex items-center gap-2 text-xs text-amber-800 sm:text-sm">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden />
                {floor.remainingNote}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rooms</p>
            <p className="text-xl font-bold text-slate-900 sm:text-2xl">{floor.roomCount}</p>
          </div>
        </div>
        <div className="mt-3 md:overflow-x-auto sm:mt-4">
          <RoomTableWithModals rooms={floor.rooms} onOpen={(r) => setModal({ kind: "room", room: r, floorLabel: floor.floorLabel })} />
        </div>
      </div>
      <ListingDetailModal state={modal} onClose={() => setModal(null)} listingPropertyId={listingPropertyId} />
    </>
  );
}

function RoomTableWithModals({ rooms, onOpen }: { rooms: ListingRoomRow[]; onOpen: (r: ListingRoomRow) => void }) {
  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rooms.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
            <p className="text-sm font-semibold text-slate-900">{r.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">{r.detail}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-slate-900 sm:text-sm">{r.price}</p>
              <AvailabilityPill text={r.availability} />
            </div>
            <DetailsButton className="mt-2.5 w-full" onClick={() => onOpen(r)} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[560px] lg:min-w-0">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] gap-2 border-b border-slate-100 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:gap-3 sm:pb-2 sm:text-[11px]">
            <span>Room</span>
            <span>Price</span>
            <span>Availability</span>
            <span className="w-[80px] text-right sm:w-[88px] sm:text-left" />
          </div>
          {rooms.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-2 border-b border-slate-100 py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{r.detail}</p>
              </div>
              <p className="text-xs font-semibold text-slate-900 sm:text-sm">{r.price}</p>
              <AvailabilityPill text={r.availability} />
              <DetailsButton onClick={() => onOpen(r)} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function BathroomTableInteractive({ rows, listingPropertyId }: { rows: ListingBathroomRow[]; listingPropertyId: string }) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
            <p className="text-sm font-semibold text-slate-900">{r.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">{r.detail}</p>
            <p className="mt-2 text-xs text-slate-800 sm:text-sm">
              <span className="font-semibold text-slate-500">Info: </span>
              {formatBathroomIncludes(r)}
            </p>
            <DetailsButton className="mt-2.5 w-full" onClick={() => setModal({ kind: "bathroom", row: r })} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[520px] lg:min-w-0">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,2.2fr)_auto] gap-2 border-b border-slate-100 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:gap-3 sm:pb-2 sm:text-[11px]">
            <span>Bathroom</span>
            <span>Info</span>
            <span className="w-[80px] sm:w-[88px]" />
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,2.2fr)_auto] items-center gap-2 border-b border-slate-100 py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{r.detail}</p>
              </div>
              <p className="text-xs font-medium text-slate-800 sm:text-sm">{formatBathroomIncludes(r)}</p>
              <DetailsButton onClick={() => setModal({ kind: "bathroom", row: r })} />
            </div>
          ))}
        </div>
      </div>
      <ListingDetailModal state={modal} onClose={() => setModal(null)} listingPropertyId={listingPropertyId} />
    </>
  );
}

export function SharedTableInteractive({ rows, listingPropertyId }: { rows: ListingSharedRow[]; listingPropertyId: string }) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
            <p className="text-sm font-semibold text-slate-900">{r.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">{r.detail}</p>
            <p className="mt-1.5 text-xs text-slate-700 sm:text-sm">{r.useNote}</p>
            <DetailsButton className="mt-2.5 w-full" onClick={() => setModal({ kind: "shared", row: r })} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[520px] lg:min-w-0">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_auto] gap-2 border-b border-slate-100 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:gap-3 sm:pb-2 sm:text-[11px]">
            <span>Space</span>
            <span>Info</span>
            <span className="w-[80px] sm:w-[88px]" />
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_auto] items-center gap-2 border-b border-slate-100 py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{r.detail}</p>
              </div>
              <p className="text-xs text-slate-700 sm:text-sm">{r.useNote}</p>
              <DetailsButton onClick={() => setModal({ kind: "shared", row: r })} />
            </div>
          ))}
        </div>
      </div>
      <ListingDetailModal state={modal} onClose={() => setModal(null)} listingPropertyId={listingPropertyId} />
    </>
  );
}

export function LeaseBasicsTableInteractive({ rows, listingPropertyId }: { rows: LeaseBasicRow[]; listingPropertyId: string }) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none" aria-hidden>
                {r.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{r.detail}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-slate-900 sm:text-sm">{r.price}</p>
              <AvailabilityPill text={r.status} />
            </div>
            <DetailsButton className="mt-2.5 w-full" onClick={() => setModal({ kind: "lease", row: r })} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[560px] lg:min-w-0">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] gap-2 border-b border-slate-100 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:gap-3 sm:pb-2 sm:text-[11px]">
            <span>Item</span>
            <span>Price</span>
            <span>Status</span>
            <span className="w-[80px] text-right sm:w-[88px] sm:text-left" />
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-2 border-b border-slate-100 py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="shrink-0 text-base leading-none" aria-hidden>
                  {r.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{r.detail}</p>
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-900 sm:text-sm">{r.price}</p>
              <AvailabilityPill text={r.status} />
              <DetailsButton onClick={() => setModal({ kind: "lease", row: r })} />
            </div>
          ))}
        </div>
      </div>
      <ListingDetailModal state={modal} onClose={() => setModal(null)} listingPropertyId={listingPropertyId} />
    </>
  );
}

export function BundleTableInteractive({ rows, listingPropertyId }: { rows: BundleCard[]; listingPropertyId: string }) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rows.map((c) => (
          <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
            <p className="text-sm font-semibold text-slate-900">{c.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{c.roomsLine}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {c.strikethrough ? <span className="text-xs text-slate-400 line-through">{c.strikethrough}</span> : null}
              <p className="text-xs font-semibold text-slate-900 sm:text-sm">{c.price}</p>
              {c.promo ? <AvailabilityPill text={c.promo} /> : null}
            </div>
            <DetailsButton className="mt-2.5 w-full" onClick={() => setModal({ kind: "bundle", row: c })} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[560px] lg:min-w-0">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] gap-2 border-b border-slate-100 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:gap-3 sm:pb-2 sm:text-[11px]">
            <span>Bundle</span>
            <span>Price</span>
            <span>Offer</span>
            <span className="w-[80px] text-right sm:w-[88px] sm:text-left" />
          </div>
          {rows.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-2 border-b border-slate-100 py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{c.roomsLine}</p>
              </div>
              <div className="text-xs font-semibold text-slate-900 sm:text-sm">
                {c.strikethrough ? <span className="mr-1.5 text-slate-400 line-through">{c.strikethrough}</span> : null}
                <span>{c.price}</span>
              </div>
              <div>{c.promo ? <AvailabilityPill text={c.promo} /> : <span className="text-xs text-slate-500">—</span>}</div>
              <DetailsButton onClick={() => setModal({ kind: "bundle", row: c })} />
            </div>
          ))}
        </div>
      </div>
      <ListingDetailModal state={modal} onClose={() => setModal(null)} listingPropertyId={listingPropertyId} />
    </>
  );
}

export function AmenitiesTableInteractive({ rows, listingPropertyId }: { rows: AmenityItem[]; listingPropertyId: string }) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rows.map((a) => (
          <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <span className="text-lg text-primary" aria-hidden>
                {a.icon}
              </span>
              <p className="text-sm font-semibold text-slate-900">{a.label}</p>
            </div>
            <p className="mt-2 text-xs text-slate-600">House feature · included with this listing</p>
            <div className="mt-2">
              <AvailabilityPill text="Included" />
            </div>
            <DetailsButton className="mt-2.5 w-full" onClick={() => setModal({ kind: "amenity", row: a })} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[560px] lg:min-w-0">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] gap-2 border-b border-slate-100 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:gap-3 sm:pb-2 sm:text-[11px]">
            <span>Amenity</span>
            <span>Info</span>
            <span>Included</span>
            <span className="w-[80px] text-right sm:w-[88px] sm:text-left" />
          </div>
          {rows.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-2 border-b border-slate-100 py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="shrink-0 text-base text-primary" aria-hidden>
                  {a.icon}
                </span>
                <p className="min-w-0 text-sm font-semibold text-slate-900">{a.label}</p>
              </div>
              <p className="text-xs text-slate-600 sm:text-sm">With listing</p>
              <AvailabilityPill text="Included" />
              <DetailsButton onClick={() => setModal({ kind: "amenity", row: a })} />
            </div>
          ))}
        </div>
      </div>
      <ListingDetailModal state={modal} onClose={() => setModal(null)} listingPropertyId={listingPropertyId} />
    </>
  );
}
