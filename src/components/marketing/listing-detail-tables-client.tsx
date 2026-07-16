"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/hooks/use-is-client";
import type {
  AmenityItem,
  BundleCard,
  LeaseBasicRow,
  ListingBathroomRow,
  ListingFloorCard,
  ListingRoomRow,
  ListingSharedRow,
} from "@/data/listing-rich-content";
import {
  listingLinkTargetProps,
  useListingPreviewNewTab,
} from "@/components/marketing/listing-preview-context";
import {
  buildSmsDeepLink,
  isClawMessagingPubliclyEnabled,
} from "@/lib/claw-leasing-links";
import { buildTourContactHref } from "@/lib/manager-property-links";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import { getRoomUnavailabilityWindows, LISTING_ROOM_CHOICE_SEP, type RoomUnavailabilityWindow } from "@/lib/rental-application/data";
import { roomAvailabilityPillClasses, roomAvailabilityTone } from "@/lib/room-availability-style";

const LISTING_TABLE_HEAD =
  "text-[10px] font-semibold uppercase tracking-wide text-muted sm:text-[11px]";
const LISTING_ROW_SURFACE =
  "rounded-xl border border-border bg-card p-3 listing-detail-surface sm:p-4";
const LISTING_FLOOR_CARD =
  "overflow-hidden rounded-xl border border-border bg-card shadow-sm listing-detail-surface";
const LISTING_DETAIL_BUTTON =
  "listing-detail-control inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-full border border-border bg-card px-3.5 py-1.5 text-[11px] font-semibold text-foreground shadow-sm transition hover:border-primary/45 hover:bg-accent/35 hover:text-primary sm:min-h-0";

function AvailabilityPill({ text, variant = "default" }: { text: string; variant?: "default" | "room" }) {
  if (variant === "room") {
    const tone = roomAvailabilityTone(text);
    const { wrap, dot } = roomAvailabilityPillClasses(tone);
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs ${wrap}`}
      >
        <span className={`h-1 w-1 shrink-0 rounded-full sm:h-1.5 sm:w-1.5 ${dot}`} />
        {text}
      </span>
    );
  }
  const t = text.toLowerCase();
  const green = t.includes("available") || t.includes("included");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)] sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs ${
        green ? "portal-badge-success" : "border border-border bg-accent/35 text-foreground"
      }`}
    >
      <span className={`h-1 w-1 shrink-0 rounded-full sm:h-1.5 sm:w-1.5 ${green ? "bg-emerald-500" : "bg-muted"}`} />
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
      data-attr="listing-row-details"
      onClick={onClick}
      className={`${LISTING_DETAIL_BUTTON} ${className}`}
    >
      Details
    </button>
  );
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addMonths(base: Date, months: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + months, 1);
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatRangeDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function rangeSummaryLabel(w: RoomUnavailabilityWindow): string {
  if (w.start && w.end) return `Unavailable ${formatRangeDate(w.start)} to ${formatRangeDate(w.end)}`;
  if (w.start) return `Unavailable from ${formatRangeDate(w.start)}`;
  if (w.end) return `Unavailable until ${formatRangeDate(w.end)}`;
  return "Unavailable dates set";
}

function dayIsUnavailable(day: Date, windows: RoomUnavailabilityWindow[]): boolean {
  const t = startOfLocalDay(day).getTime();
  return windows.some((w) => {
    const start = w.start ? startOfLocalDay(w.start).getTime() : Number.NEGATIVE_INFINITY;
    const end = w.end ? startOfLocalDay(w.end).getTime() : Number.POSITIVE_INFINITY;
    return t >= start && t <= end;
  });
}

function MiniAvailabilityCalendar({ windows }: { windows: RoomUnavailabilityWindow[] }) {
  const today = startOfLocalDay(new Date());
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultEndMonth = addMonths(startMonth, 11);
  const maxWindowMonth = windows.reduce((latest, w) => {
    const d = w.end ?? w.start;
    if (!d) return latest;
    const m = new Date(d.getFullYear(), d.getMonth(), 1);
    return m.getTime() > latest.getTime() ? m : latest;
  }, startMonth);
  const endMonth = maxWindowMonth.getTime() > defaultEndMonth.getTime() ? maxWindowMonth : defaultEndMonth;
  const monthCount =
    (endMonth.getFullYear() - startMonth.getFullYear()) * 12 + (endMonth.getMonth() - startMonth.getMonth()) + 1;
  const [monthOffset, setMonthOffset] = useState(0);
  const windowsKey = windows.map((w) => `${w.start?.toISOString() ?? ""}|${w.end?.toISOString() ?? ""}`).join(",");
  const [prevWindowsKey, setPrevWindowsKey] = useState(windowsKey);
  if (windowsKey !== prevWindowsKey) {
    setPrevWindowsKey(windowsKey);
    setMonthOffset(0);
  }

  const clampedOffset = Math.min(Math.max(monthOffset, 0), Math.max(monthCount - 1, 0));
  const monthStart = addMonths(startMonth, clampedOffset);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const leading = monthStart.getDay();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), d));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted disabled:cursor-not-allowed disabled:opacity-45"
          disabled={clampedOffset <= 0}
          onClick={() => setMonthOffset((v) => Math.max(v - 1, 0))}
        >
          Previous month
        </button>
        <p className="text-xs font-semibold text-muted">
          {monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted disabled:cursor-not-allowed disabled:opacity-45"
          disabled={clampedOffset >= monthCount - 1}
          onClick={() => setMonthOffset((v) => Math.min(v + 1, monthCount - 1))}
        >
          Next month
        </button>
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
          <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (!cell) return <span key={`empty-${idx}`} className="h-7" />;
            const unavailable = dayIsUnavailable(cell, windows);
            const isToday = dateKey(cell) === dateKey(today);
            return (
              <span
                key={dateKey(cell)}
                className={`flex h-7 items-center justify-center rounded-md text-[11px] font-medium ${
                  unavailable
                    ? "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]"
                    : "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]"
                } ${isToday ? "ring-2 ring-primary/40" : ""}`}
              >
                {cell.getDate()}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const LISTING_MODAL_LABEL = "text-xs font-semibold uppercase tracking-wide text-muted";
const LISTING_MODAL_CARD = "rounded-xl border border-border bg-card p-4";
const LISTING_MODAL_MEDIA_WRAP = "mx-auto flex w-full max-w-2xl flex-col items-center";
const LISTING_MODAL_MEDIA_FRAME = "aspect-video w-full overflow-hidden rounded-lg";

function ListingModalBody({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 p-5 pb-6 sm:p-6">{children}</div>;
}

function ListingModalHeader({
  eyebrow,
  title,
  subtitle,
  icon,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: string;
}) {
  return (
    <header className="border-b border-border pb-4">
      {eyebrow ? <p className={LISTING_MODAL_LABEL}>{eyebrow}</p> : null}
      <div className={`flex items-start gap-3 ${eyebrow ? "mt-1" : ""}`}>
        {icon ? (
          <span className="text-2xl leading-none" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="pr-8 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p> : null}
        </div>
      </div>
    </header>
  );
}

function ListingModalSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className={LISTING_MODAL_CARD}>
      <p className={LISTING_MODAL_LABEL}>{label}</p>
      <div className="mt-2 text-sm leading-relaxed text-foreground">{children}</div>
    </section>
  );
}

function truncateModalText(text: string | undefined, max = 100): string {
  const t = text?.trim();
  if (!t) return "—";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function ListingModalStatGrid({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  const colClass =
    items.length >= 5 ? "sm:grid-cols-2 lg:grid-cols-3" : items.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div className={`grid gap-3 ${colClass}`}>
      {items.map((item) => (
        <div key={item.label} className={LISTING_MODAL_CARD}>
          <p className={LISTING_MODAL_LABEL}>{item.label}</p>
          <div className="mt-2 text-xs font-medium leading-snug text-foreground sm:text-sm [&_*]:break-words">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function ListingModalTags({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((t) => (
        <span key={t} className="rounded-full border border-border bg-accent/40 px-3 py-1 text-xs font-medium text-foreground">
          {t}
        </span>
      ))}
    </div>
  );
}

function ListingModalVideo({
  label,
  videoSrc,
  placeholderTitle,
  placeholderSubtitle,
}: {
  label: string;
  videoSrc?: string | null;
  placeholderTitle: string;
  placeholderSubtitle: string;
}) {
  return (
    <ListingModalSection label={label}>
      <div className={LISTING_MODAL_MEDIA_WRAP}>
        {videoSrc ? (
          <video
            src={videoSrc}
            controls
            playsInline
            className={`${LISTING_MODAL_MEDIA_FRAME} bg-black object-cover`}
          />
        ) : (
          <div
            className={`${LISTING_MODAL_MEDIA_FRAME} flex flex-col items-center justify-center border border-dashed border-border bg-accent/20 px-4 text-center`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-lg text-muted">
              ▶
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">{placeholderTitle}</p>
            <p className="mt-1 max-w-sm text-xs text-muted">{placeholderSubtitle}</p>
          </div>
        )}
      </div>
    </ListingModalSection>
  );
}

function ListingModalCta({
  href,
  label,
  variant,
  dataAttr,
  newTabProps,
}: {
  href: string;
  label: string;
  variant: "primary" | "secondary";
  dataAttr?: string;
  newTabProps: ReturnType<typeof listingLinkTargetProps>;
}) {
  const className =
    variant === "primary"
      ? "flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary py-3 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(47,107,255,0.28)] transition hover:opacity-95"
      : "flex min-h-[48px] w-full items-center justify-center rounded-full border border-border bg-card py-3 text-sm font-semibold text-foreground transition hover:bg-accent/30";
  // sms: must use a plain anchor — Next Link treats it as an app route.
  if (href.startsWith("sms:")) {
    return (
      <a href={href} className="flex-1" data-attr={dataAttr}>
        <span className={className}>{label}</span>
      </a>
    );
  }
  return (
    <Link href={href} className="flex-1" data-attr={dataAttr} {...newTabProps}>
      <span className={className}>{label}</span>
    </Link>
  );
}

function ListingModalActions({
  primary,
  secondary,
  newTabProps,
}: {
  primary: { href: string; label: string; dataAttr?: string };
  secondary: { href: string; label: string; dataAttr?: string };
  newTabProps: ReturnType<typeof listingLinkTargetProps>;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
      <ListingModalCta
        href={primary.href}
        label={primary.label}
        variant="primary"
        dataAttr={primary.dataAttr}
        newTabProps={newTabProps}
      />
      <ListingModalCta
        href={secondary.href}
        label={secondary.label}
        variant="secondary"
        dataAttr={secondary.dataAttr}
        newTabProps={newTabProps}
      />
    </div>
  );
}

function PhotoStrip({ captions, imageUrls }: { captions?: string[]; imageUrls?: string[] }) {
  const imgs = imageUrls?.filter(Boolean) ?? [];
  if (imgs.length > 0) {
    return (
      <div className={`${LISTING_MODAL_MEDIA_WRAP} space-y-3`}>
        {imgs.map((src, i) => (
          <div key={`${src.slice(0, 48)}-${i}`} className={`${LISTING_MODAL_MEDIA_FRAME} bg-accent/30`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover object-center" />
          </div>
        ))}
      </div>
    );
  }
  const caps = captions ?? [];
  if (caps.length === 0) return null;
  return (
    <div className={`${LISTING_MODAL_MEDIA_WRAP} space-y-3`}>
      {caps.map((cap) => (
        <div
          key={cap}
          className={`${LISTING_MODAL_MEDIA_FRAME} flex flex-col items-center justify-center border border-dashed border-border bg-accent/25 p-4 text-center`}
        >
          <p className="text-sm font-semibold text-foreground">{cap}</p>
        </div>
      ))}
    </div>
  );
}

type ModalState =
  | { kind: "room"; room: ListingRoomRow; floorLabel: string }
  | { kind: "floorPlan"; floor: ListingFloorCard }
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
  propertyLabel = null,
}: {
  state: ModalState;
  onClose: () => void;
  listingPropertyId: string;
  propertyLabel?: string | null;
}) {
  const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);
  const isClient = useIsClient();
  const newTabProps = listingLinkTargetProps(useListingPreviewNewTab());
  const textEnabled = isClawMessagingPubliclyEnabled();
  const label = propertyLabel?.trim() || null;
  // Flag off (or no SMS handler on this device) → web apply / tour-contact
  // flows instead of dead "#" anchors.
  const webApplyHref = buildRentalApplyHref({ propertyId: listingPropertyId });
  const webContactHref = buildTourContactHref(listingPropertyId);
  const textApplyHref = textEnabled
    ? buildSmsDeepLink({ intent: "apply", propertyId: listingPropertyId, propertyLabel: label })
    : webApplyHref;
  const textMessageHref = textEnabled
    ? buildSmsDeepLink({ intent: "question", propertyId: listingPropertyId, propertyLabel: label })
    : webContactHref;
  const textMessageAbout = (topic: string) =>
    textEnabled
      ? buildSmsDeepLink({ intent: "question", propertyId: listingPropertyId, propertyLabel: label, topic })
      : webContactHref;
  const applyLabel = textEnabled ? "Text to apply" : "Apply online";
  const messageLabel = textEnabled ? "Text a message" : "Contact leasing";

  useEffect(() => {
    if (!state) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state]);

  if (!state) return null;
  if (!isClient || typeof document === "undefined") return null;

  const panel = (
    <div className="fixed inset-0 z-[240] flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 modal-overlay" onClick={onClose} aria-label="Close dialog" />
      <div
        className="modal-panel relative z-10 max-h-[min(92vh,820px)] w-full max-w-lg overflow-y-auto rounded-3xl border border-border shadow-2xl sm:max-w-2xl"
        onClick={stop}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-card text-lg text-muted shadow-sm ring-1 ring-border transition hover:bg-accent/30"
          aria-label="Close"
        >
          ×
        </button>

        {state.kind === "room" ? (
          <ListingModalBody>
            {(() => {
              const roomChoiceValue = `${listingPropertyId}${LISTING_ROOM_CHOICE_SEP}${state.room.id}`;
              const roomUnavailableWindows = getRoomUnavailabilityWindows(roomChoiceValue);
              return (
                <>
                  <ListingModalHeader eyebrow={state.floorLabel} title={state.room.name} />
                  <ListingModalStatGrid
                    items={[
                      {
                        label: "Floor / level",
                        value: state.room.modal.floorLine?.trim() || "—",
                      },
                      ...(state.room.utilitiesEstimate
                        ? [{ label: "Utilities", value: state.room.utilitiesEstimate }]
                        : []),
                      {
                        label: "Room details",
                        value:
                          state.room.modal.roomNotes?.trim() ? (
                            <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed">
                              {truncateModalText(state.room.modal.roomNotes, 160)}
                            </p>
                          ) : (
                            "No extra room notes"
                          ),
                      },
                      {
                        label: "Bathroom",
                        value: (
                          <div className="space-y-1">
                            <p>{state.room.modal.bathroomShortLabel ?? "—"}</p>
                            {state.room.modal.bathroomDetailLine ? (
                              <p className="text-xs font-normal leading-snug text-muted">
                                {state.room.modal.bathroomDetailLine}
                              </p>
                            ) : null}
                          </div>
                        ),
                      },
                      {
                        label: "Status",
                        value: <AvailabilityPill text={state.room.availability} variant="room" />,
                      },
                    ]}
                  />
                  <ListingModalSection label="Availability timeline">
                    {roomUnavailableWindows.length > 0 ? (
                      <>
                        <div className="space-y-2">
                          {roomUnavailableWindows.map((w) => (
                            <div
                              key={w.id}
                              className="flex items-start gap-2 rounded-lg border border-border bg-accent/30 px-3 py-2 text-xs text-muted"
                            >
                              <span
                                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${w.source === "resident" ? "bg-rose-500" : "bg-sky-500"}`}
                              />
                              <span>{rangeSummaryLabel(w)}</span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-xs text-muted">Green dates are open and red dates are unavailable for this room.</p>
                        <div className="mt-3">
                          <MiniAvailabilityCalendar windows={roomUnavailableWindows} />
                        </div>
                      </>
                    ) : (
                      <p className="text-emerald-700 [html[data-theme=dark]_&]:text-emerald-300">
                        No blocked ranges or resident occupancy currently set for this room.
                      </p>
                    )}
                  </ListingModalSection>
                  {(state.room.modal.photoUrls?.length ?? 0) > 0 ? (
                    <ListingModalSection label="Photos">
                      <PhotoStrip imageUrls={state.room.modal.photoUrls} />
                    </ListingModalSection>
                  ) : null}
                  <ListingModalVideo
                    label={state.room.modal.tourEyebrow}
                    videoSrc={state.room.modal.videoSrc}
                    placeholderTitle={state.room.modal.tourTitle}
                    placeholderSubtitle={state.room.modal.tourSubtitle}
                  />
                  {(() => {
                    const bathTagPattern = /^(private|shared|house hall)\s+bath$/i;
                    const highlightTags = state.room.modal.includedTags.filter((t) => !bathTagPattern.test(t));
                    const furnishingLine = state.room.modal.furnishingDetail?.trim();
                    const amenityLabels = state.room.modal.roomAmenityLabels ?? [];
                    return (
                      <>
                        {highlightTags.length > 0 ? (
                          <ListingModalSection label="Room highlights">
                            <ListingModalTags tags={highlightTags} />
                          </ListingModalSection>
                        ) : null}
                        {furnishingLine ? (
                          <ListingModalSection label="Included in this room">
                            <p className="text-muted">{furnishingLine}</p>
                          </ListingModalSection>
                        ) : null}
                        {amenityLabels.length > 0 ? (
                          <ListingModalSection label="Room amenities">
                            <ListingModalTags tags={amenityLabels} />
                          </ListingModalSection>
                        ) : null}
                      </>
                    );
                  })()}
                  <ListingModalActions
                    newTabProps={newTabProps}
                    primary={{
                      href: textEnabled
                        ? buildSmsDeepLink({
                            intent: "apply",
                            propertyId: listingPropertyId,
                            propertyLabel: label,
                            roomName: state.room.name,
                          })
                        : textApplyHref,
                      label: applyLabel,
                      dataAttr: "listing-text-apply-room",
                    }}
                    secondary={{
                      href: textMessageHref,
                      label: messageLabel,
                      dataAttr: "listing-text-message",
                    }}
                  />
                </>
              );
            })()}
          </ListingModalBody>
        ) : null}

        {state.kind === "floorPlan" ? (
          <ListingModalBody>
            <ListingModalHeader eyebrow="Floor plan" title={state.floor.floorLabel} />
            <ListingModalSection label="Layout">
              <div className={LISTING_MODAL_MEDIA_WRAP}>
                {state.floor.floorPlanImageUrl ? (
                  <div className={`${LISTING_MODAL_MEDIA_FRAME} bg-accent/30`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={state.floor.floorPlanImageUrl}
                      alt={`Floor plan for ${state.floor.floorLabel}`}
                      className="h-full w-full object-contain object-center"
                    />
                  </div>
                ) : (
                  <div
                    className={`${LISTING_MODAL_MEDIA_FRAME} flex flex-col items-center justify-center border border-dashed border-border bg-accent/20 px-4 text-center`}
                  >
                    <p className="text-sm font-semibold text-foreground">No floor plan submitted yet</p>
                    <p className="mt-1 max-w-sm text-xs text-muted">
                      The property manager has not uploaded a floor plan for this level. Ask leasing for layout details.
                    </p>
                  </div>
                )}
              </div>
            </ListingModalSection>
            <ListingModalActions
              newTabProps={newTabProps}
              primary={{
                href: textMessageAbout("the floor plan / layout"),
                label: messageLabel,
                dataAttr: "listing-text-message-layout",
              }}
              secondary={{
                href: textApplyHref,
                label: applyLabel,
                dataAttr: "listing-text-apply",
              }}
            />
          </ListingModalBody>
        ) : null}

        {state.kind === "bathroom" ? (
          <ListingModalBody>
            <ListingModalHeader eyebrow={state.row.modal.eyebrow} title={state.row.name} subtitle={state.row.detail} />
            <ListingModalSection label="Setup">
              <p>{state.row.modal.setupCard}</p>
            </ListingModalSection>
            <ListingModalSection label="Info">
              <ListingModalTags tags={state.row.modal.includedTags} />
            </ListingModalSection>
            <ListingModalSection label="Photos">
              <PhotoStrip captions={state.row.modal.photoCaptions} imageUrls={state.row.modal.photoUrls} />
            </ListingModalSection>
            <ListingModalVideo
              label="Bathroom tour"
              videoSrc={state.row.modal.videoSrc}
              placeholderTitle="Video tour"
              placeholderSubtitle="Add a bathroom video in the manager form to replace this placeholder."
            />
            <ListingModalActions
              newTabProps={newTabProps}
              primary={{
                href: textMessageAbout("this bathroom"),
                label: messageLabel,
                dataAttr: "listing-text-message-bathroom",
              }}
              secondary={{
                href: textApplyHref,
                label: applyLabel,
                dataAttr: "listing-text-apply",
              }}
            />
          </ListingModalBody>
        ) : null}

        {state.kind === "shared" ? (
          <ListingModalBody>
            <ListingModalHeader eyebrow={state.row.modal.eyebrow} title={state.row.name} subtitle={state.row.detail} />
            {state.row.useNote ? <p className="text-sm text-muted">{state.row.useNote}</p> : null}
            <ListingModalVideo
              label={state.row.modal.tourEyebrow}
              videoSrc={state.row.modal.videoSrc}
              placeholderTitle={state.row.modal.tourTitle}
              placeholderSubtitle={state.row.modal.tourSubtitle}
            />
            <ListingModalSection label="What's included">
              <ListingModalTags tags={state.row.modal.includedTags} />
            </ListingModalSection>
            <ListingModalSection label="Photos">
              <PhotoStrip captions={state.row.modal.photoCaptions} imageUrls={state.row.modal.photoUrls} />
            </ListingModalSection>
            <ListingModalActions
              newTabProps={newTabProps}
              primary={{
                href: textApplyHref,
                label: applyLabel,
                dataAttr: "listing-text-apply",
              }}
              secondary={{
                href: textMessageHref,
                label: messageLabel,
                dataAttr: "listing-text-message",
              }}
            />
          </ListingModalBody>
        ) : null}

        {state.kind === "lease" ? (
          <ListingModalBody>
            <ListingModalHeader
              eyebrow="Lease"
              icon={state.row.icon}
              title={state.row.title}
              subtitle={state.row.detail}
            />
            <ListingModalStatGrid
              items={[
                { label: "Amount / rate", value: state.row.price },
                { label: "Timing", value: <AvailabilityPill text={state.row.status} /> },
              ]}
            />
            <ListingModalSection label="Details">
              <p className="text-muted">{state.row.body}</p>
            </ListingModalSection>
            <ListingModalActions
              newTabProps={newTabProps}
              primary={{
                href: textApplyHref,
                label: applyLabel,
                dataAttr: "listing-text-apply",
              }}
              secondary={{
                href: textMessageAbout("lease terms"),
                label: messageLabel,
                dataAttr: "listing-text-message-lease",
              }}
            />
          </ListingModalBody>
        ) : null}

        {state.kind === "bundle" ? (
          <ListingModalBody>
            <ListingModalHeader eyebrow="Bundle" title={state.row.label} />
            <ListingModalSection label="Monthly">
              <div className="flex flex-wrap items-baseline gap-2">
                {state.row.strikethrough ? (
                  <span className="text-sm text-muted line-through">{state.row.strikethrough}</span>
                ) : null}
                <span className="text-2xl font-bold">{state.row.price}</span>
                {state.row.promo ? <AvailabilityPill text={state.row.promo} /> : null}
              </div>
            </ListingModalSection>
            {state.row.summaryItems?.length ? (
              <ListingModalStatGrid
                items={state.row.summaryItems.map((item) => ({ label: item.label, value: item.value }))}
              />
            ) : null}
            <ListingModalSection label="Included rooms">
              {state.row.roomLines?.length ? (
                <div className="grid gap-2">
                  {state.row.roomLines.map((line) => (
                    <div key={line} className="rounded-lg border border-border bg-accent/30 px-3 py-2">
                      {line}
                    </div>
                  ))}
                </div>
              ) : (
                <p>{state.row.roomsLine}</p>
              )}
            </ListingModalSection>
            <p className="text-xs text-muted">Confirm availability, utilities, and final rent with leasing before applying.</p>
            <ListingModalActions
              newTabProps={newTabProps}
              primary={{
                href: textEnabled
                  ? buildSmsDeepLink({
                      intent: "bundle",
                      propertyId: listingPropertyId,
                      propertyLabel: label,
                      bundleId: state.row.id,
                      bundleLabel: state.row.label,
                    })
                  : textApplyHref,
                label: textEnabled ? "Text for bundle" : "Apply online",
                dataAttr: "listing-text-bundle",
              }}
              secondary={{
                href: textMessageHref,
                label: messageLabel,
                dataAttr: "listing-text-message",
              }}
            />
          </ListingModalBody>
        ) : null}

        {state.kind === "amenity" ? (
          <ListingModalBody>
            <ListingModalHeader eyebrow="Amenity" icon={state.row.icon} title={state.row.label} />
            <ListingModalSection label="About">
              <p className="text-muted">
                This feature is included with the listing as described. Confirm specifics with the leasing team before you apply.
              </p>
            </ListingModalSection>
            <ListingModalActions
              newTabProps={newTabProps}
              primary={{
                href: textMessageHref,
                label: messageLabel,
                dataAttr: "listing-text-message",
              }}
              secondary={{
                href: textApplyHref,
                label: applyLabel,
                dataAttr: "listing-text-apply",
              }}
            />
          </ListingModalBody>
        ) : null}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

function FloorPlanSummaryBar({
  floor,
  onOpenFloorPlan,
}: {
  floor: ListingFloorCard;
  onOpenFloorPlan: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">{floor.floorLabel}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{floor.fromPrice}</p>
        {floor.remainingNote ? (
          <p className="mt-1.5 flex items-center gap-2 text-xs text-sky-700 [html[data-theme=dark]_&]:text-sky-300">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" aria-hidden />
            {floor.remainingNote}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border border-border bg-accent/35 px-3 py-1.5 listing-detail-surface">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Rooms</span>
          <span className="text-sm font-bold text-foreground">{floor.roomCount}</span>
        </div>
        <DetailsButton onClick={onOpenFloorPlan} />
      </div>
    </div>
  );
}

export function InteractiveFloorPlanCard({
  floor,
  listingPropertyId,
  propertyLabel = null,
}: {
  floor: ListingFloorCard;
  listingPropertyId: string;
  propertyLabel?: string | null;
}) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className={LISTING_FLOOR_CARD}>
        <div className="border-b border-border/50 px-4 py-3.5 sm:px-5">
          <FloorPlanSummaryBar floor={floor} onOpenFloorPlan={() => setModal({ kind: "floorPlan", floor })} />
        </div>
        <div className="relative isolate px-4 py-3 sm:px-5 sm:py-4 md:overflow-x-auto">
          <RoomTableWithModals rooms={floor.rooms} onOpen={(r) => setModal({ kind: "room", room: r, floorLabel: floor.floorLabel })} />
        </div>
      </div>
      <ListingDetailModal
        state={modal}
        onClose={() => setModal(null)}
        listingPropertyId={listingPropertyId}
        propertyLabel={propertyLabel}
      />
    </>
  );
}

function RoomTableWithModals({ rooms, onOpen }: { rooms: ListingRoomRow[]; onOpen: (r: ListingRoomRow) => void }) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {rooms.map((r) => (
          <div key={r.id} className={`flex flex-col gap-2 sm:gap-2.5 ${LISTING_ROW_SURFACE}`}>
            <div>
              <p className="text-sm font-semibold text-foreground">{r.name}</p>
              <p className="mt-0.5 text-xs text-muted">{r.detail}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-foreground sm:text-sm">{r.price}</p>
              <AvailabilityPill text={r.availability} variant="room" />
            </div>
            <DetailsButton className="w-full" onClick={() => onOpen(r)} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[560px] lg:min-w-0">
          <div className={`grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] gap-2 border-b border-border pb-1.5 sm:gap-3 sm:pb-2 ${LISTING_TABLE_HEAD}`}>
            <span>Room</span>
            <span>Price</span>
            <span>Availability</span>
            <span className="w-[80px] text-right sm:w-[88px] sm:text-left" />
          </div>
          {rooms.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-2 border-b border-border py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted">{r.detail}</p>
              </div>
              <p className="text-xs font-semibold text-foreground sm:text-sm">{r.price}</p>
              <AvailabilityPill text={r.availability} variant="room" />
              <DetailsButton onClick={() => onOpen(r)} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function BathroomTableInteractive({
  rows,
  listingPropertyId,
  propertyLabel = null,
}: {
  rows: ListingBathroomRow[];
  listingPropertyId: string;
  propertyLabel?: string | null;
}) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className={LISTING_ROW_SURFACE}>
            <p className="text-sm font-semibold text-foreground">{r.name}</p>
            <p className="mt-0.5 text-xs text-muted">{r.detail}</p>
            <p className="mt-2 text-xs text-foreground sm:text-sm">
              <span className="font-semibold text-muted">Info: </span>
              {formatBathroomIncludes(r)}
            </p>
            <DetailsButton className="mt-2.5 w-full" onClick={() => setModal({ kind: "bathroom", row: r })} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[520px] lg:min-w-0">
          <div className={`grid grid-cols-[minmax(0,2fr)_minmax(0,2.2fr)_auto] gap-2 border-b border-border pb-1.5 sm:gap-3 sm:pb-2 ${LISTING_TABLE_HEAD}`}>
            <span>Bathroom</span>
            <span>Info</span>
            <span className="w-[80px] sm:w-[88px]" />
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,2.2fr)_auto] items-center gap-2 border-b border-border py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted">{r.detail}</p>
              </div>
              <p className="text-xs font-medium text-foreground sm:text-sm">{formatBathroomIncludes(r)}</p>
              <DetailsButton onClick={() => setModal({ kind: "bathroom", row: r })} />
            </div>
          ))}
        </div>
      </div>
      <ListingDetailModal
        state={modal}
        onClose={() => setModal(null)}
        listingPropertyId={listingPropertyId}
        propertyLabel={propertyLabel}
      />
    </>
  );
}

/** Table-only: avoid long room lists and full manager notes — full text stays in the modal. */
function sharedSpaceAccessSummary(detail: string): string {
  const t = detail.trim();
  if (!t || t === "Select room access in manager form") return "Set room access in listing editor";
  const prefix = "Room access:";
  if (!t.startsWith(prefix)) {
    return t.length > 72 ? `${t.slice(0, 69)}…` : t;
  }
  const rest = t.slice(prefix.length).trim();
  const parts = rest.split(",").map((s) => s.trim()).filter(Boolean);
  const n = parts.length;
  if (n === 0) return "Room access TBD";
  if (n <= 2) return t.length > 80 ? `${t.slice(0, 77)}…` : t;
  return `${n} listed bedrooms have access`;
}

function sharedSpaceInfoSummary(useNote: string): string {
  return useNote.trim() ? "With listing" : "—";
}

export function SharedTableInteractive({
  rows,
  listingPropertyId,
  propertyLabel = null,
}: {
  rows: ListingSharedRow[];
  listingPropertyId: string;
  propertyLabel?: string | null;
}) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className={LISTING_ROW_SURFACE}>
            <p className="text-sm font-semibold text-foreground">{r.name}</p>
            <p className="mt-0.5 text-xs text-muted">{sharedSpaceAccessSummary(r.detail)}</p>
            <p className="mt-2 text-xs text-muted sm:text-sm">{sharedSpaceInfoSummary(r.useNote)}</p>
            <DetailsButton className="mt-2.5 w-full" onClick={() => setModal({ kind: "shared", row: r })} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[520px] lg:min-w-0">
          <div className={`grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] gap-2 border-b border-border pb-1.5 sm:gap-3 sm:pb-2 ${LISTING_TABLE_HEAD}`}>
            <span>Space</span>
            <span>Info</span>
            <span className="w-[80px] sm:w-[88px]" />
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted">{sharedSpaceAccessSummary(r.detail)}</p>
              </div>
              <p className="text-xs text-muted sm:text-sm">{sharedSpaceInfoSummary(r.useNote)}</p>
              <DetailsButton onClick={() => setModal({ kind: "shared", row: r })} />
            </div>
          ))}
        </div>
      </div>
      <ListingDetailModal
        state={modal}
        onClose={() => setModal(null)}
        listingPropertyId={listingPropertyId}
        propertyLabel={propertyLabel}
      />
    </>
  );
}

export function LeaseBasicsTableInteractive({
  rows,
  listingPropertyId,
  propertyLabel = null,
}: {
  rows: LeaseBasicRow[];
  listingPropertyId: string;
  propertyLabel?: string | null;
}) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className={LISTING_ROW_SURFACE}>
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none" aria-hidden>
                {r.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted">{r.detail}</p>
              </div>
            </div>
            <p className="mt-2 text-xs font-semibold text-foreground sm:text-sm">{r.price}</p>
            <DetailsButton className="mt-2.5 w-full" onClick={() => setModal({ kind: "lease", row: r })} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[560px] lg:min-w-0">
          <div className={`grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] gap-2 border-b border-border pb-1.5 sm:gap-3 sm:pb-2 ${LISTING_TABLE_HEAD}`}>
            <span>Item</span>
            <span>Price</span>
            <span className="w-[80px] text-right sm:w-[88px] sm:text-left" />
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="shrink-0 text-base leading-none" aria-hidden>
                  {r.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{r.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{r.detail}</p>
                </div>
              </div>
              <p className="text-xs font-semibold text-foreground sm:text-sm">{r.price}</p>
              <DetailsButton onClick={() => setModal({ kind: "lease", row: r })} />
            </div>
          ))}
        </div>
      </div>
      <ListingDetailModal
        state={modal}
        onClose={() => setModal(null)}
        listingPropertyId={listingPropertyId}
        propertyLabel={propertyLabel}
      />
    </>
  );
}

function BundleRoomPreview({ row }: { row: BundleCard }) {
  const roomLines = row.roomLines ?? [];
  if (roomLines.length === 0) {
    return <p className="mt-2 text-sm leading-relaxed text-muted">{row.roomsLine}</p>;
  }
  const preview = roomLines.slice(0, 4);
  const remaining = roomLines.length - preview.length;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {preview.map((line) => (
        <span
          key={line}
          className="inline-flex max-w-full items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground"
        >
          <span className="truncate">{line}</span>
        </span>
      ))}
      {remaining > 0 ? (
        <span className="inline-flex items-center rounded-full bg-accent/30 px-3 py-1 text-xs font-semibold text-muted">
          +{remaining} more
        </span>
      ) : null}
    </div>
  );
}

export function BundleTableInteractive({
  rows,
  listingPropertyId,
  propertyLabel = null,
}: {
  rows: BundleCard[];
  listingPropertyId: string;
  propertyLabel?: string | null;
}) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className={`grid gap-4 ${rows.length >= 3 ? "xl:grid-cols-3" : ""} md:grid-cols-2`}>
        {rows.map((c) => (
          <div
            key={c.id}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm ring-1 ring-border/70 transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg hover:ring-primary/20 sm:p-5"
          >
            <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-primary/40 opacity-90" aria-hidden />
            <div className="relative pl-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Package</p>
                  <p className="mt-1 text-lg font-bold tracking-tight text-foreground">{c.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted">{c.roomsLine}</p>
                </div>
                {c.promo ? <AvailabilityPill text={c.promo} /> : null}
              </div>
              <div className="mt-4 rounded-xl border border-border bg-accent/25 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Monthly</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  {c.strikethrough ? <span className="text-sm text-muted line-through">{c.strikethrough}</span> : null}
                  <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{c.price}</span>
                </div>
              </div>
              {c.summaryItems && c.summaryItems.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.summaryItems.slice(0, 3).map((item) => (
                    <span
                      key={`${c.id}-${item.label}`}
                      className="inline-flex items-center rounded-full border border-border bg-accent/35 px-2.5 py-1 text-[10px] font-semibold text-foreground"
                    >
                      <span className="text-muted">{item.label}:</span>
                      <span className="ml-1 text-foreground">{item.value}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <BundleRoomPreview row={c} />
              <DetailsButton className="mt-4 w-full" onClick={() => setModal({ kind: "bundle", row: c })} />
            </div>
          </div>
        ))}
      </div>
      <ListingDetailModal
        state={modal}
        onClose={() => setModal(null)}
        listingPropertyId={listingPropertyId}
        propertyLabel={propertyLabel}
      />
    </>
  );
}

export function AmenitiesTableInteractive({
  rows,
  listingPropertyId,
  propertyLabel = null,
}: {
  rows: AmenityItem[];
  listingPropertyId: string;
  propertyLabel?: string | null;
}) {
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <div className="space-y-2.5 md:hidden">
        {rows.map((a) => (
          <div key={a.id} className={LISTING_ROW_SURFACE}>
            <div className="flex items-start gap-2">
              <span className="text-lg text-primary" aria-hidden>
                {a.icon}
              </span>
              <p className="text-sm font-semibold text-foreground">{a.label}</p>
            </div>
            <p className="mt-2 text-xs text-muted">House feature · included with this listing</p>
            <DetailsButton className="mt-2.5 w-full" onClick={() => setModal({ kind: "amenity", row: a })} />
          </div>
        ))}
      </div>
      <div className="hidden min-w-0 md:block">
        <div className="min-w-[560px] lg:min-w-0">
          <div className={`grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] gap-2 border-b border-border pb-1.5 sm:gap-3 sm:pb-2 ${LISTING_TABLE_HEAD}`}>
            <span>Amenity</span>
            <span>Info</span>
            <span className="w-[80px] text-right sm:w-[88px] sm:text-left" />
          </div>
          {rows.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-center gap-2 border-b border-border py-3 last:border-0 sm:gap-3 sm:py-3.5"
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="shrink-0 text-base text-primary" aria-hidden>
                  {a.icon}
                </span>
                <p className="min-w-0 text-sm font-semibold text-foreground">{a.label}</p>
              </div>
              <p className="text-xs text-muted sm:text-sm">With listing</p>
              <DetailsButton onClick={() => setModal({ kind: "amenity", row: a })} />
            </div>
          ))}
        </div>
      </div>
      <ListingDetailModal
        state={modal}
        onClose={() => setModal(null)}
        listingPropertyId={listingPropertyId}
        propertyLabel={propertyLabel}
      />
    </>
  );
}
