"use client";

import { useMemo } from "react";
import type { ListingRoomRow } from "@/data/listing-rich-content";
import {
  ListingSpaceMediaBrowser,
  type ListingSpaceMediaCta,
} from "@/components/marketing/listing-space-media-browser";
import {
  buildSmsDeepLink,
  isClawMessagingPubliclyEnabled,
} from "@/lib/claw-leasing-links";
import { buildTourContactHref } from "@/lib/manager-property-links";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";

export type ListingRoomMediaEntry = {
  room: ListingRoomRow;
  floorLabel: string;
};

export function ListingRoomMediaBrowser({
  entries,
  listingPropertyId,
  propertyLabel = null,
  contactSmsPhone = null,
  onOpenDetails,
  className = "",
}: {
  entries: ListingRoomMediaEntry[];
  listingPropertyId: string;
  propertyLabel?: string | null;
  contactSmsPhone?: string | null;
  onOpenDetails?: (entry: ListingRoomMediaEntry) => void;
  className?: string;
}) {
  const textEnabled = isClawMessagingPubliclyEnabled(contactSmsPhone);
  const label = propertyLabel?.trim() || null;
  const applyLabel = textEnabled ? "Text to apply" : "Apply online";
  const messageLabel = textEnabled ? "Text a message" : "Contact leasing";

  const mediaEntries = useMemo(
    () =>
      entries.map((entry) => ({
        id: entry.room.id,
        eyebrow: entry.floorLabel,
        title: entry.room.name,
        metaLine: entry.room.price,
        availability: entry.room.availability,
        photoUrls: entry.room.modal.photoUrls,
        videoSrc: entry.room.modal.videoSrc,
        thumbLabel: entry.room.name,
      })),
    [entries],
  );

  const resolvePrimaryCta = (entryId: string, index: number): ListingSpaceMediaCta => {
    const entry = entries[index];
    const room = entry?.room;
    if (!room) {
      return {
        kind: "link",
        href: buildRentalApplyHref({ propertyId: listingPropertyId }),
        label: applyLabel,
        dataAttr: "listing-room-browser-apply",
      };
    }
    const href = textEnabled
      ? buildSmsDeepLink({
          intent: "apply",
          propertyId: listingPropertyId,
          propertyLabel: label,
          roomName: room.name,
          toPhone: contactSmsPhone,
        })
      : buildRentalApplyHref({
          propertyId: listingPropertyId,
          listingRoomId: room.id,
          listingRoomName: room.name,
          floorLabel: entry.floorLabel,
          roomPrice: room.price,
        });
    return { kind: "link", href, label: applyLabel, dataAttr: "listing-room-browser-apply" };
  };

  const resolveSecondaryCta = (_entryId: string, index: number): ListingSpaceMediaCta => {
    const entry = entries[index];
    if (onOpenDetails && entry) {
      return {
        kind: "button",
        label: "Full details",
        dataAttr: "listing-room-browser-details",
        onClick: () => onOpenDetails(entry),
      };
    }
    const href = textEnabled
      ? buildSmsDeepLink({
          intent: "question",
          propertyId: listingPropertyId,
          propertyLabel: label,
          roomName: entry?.room.name,
          toPhone: contactSmsPhone,
        })
      : buildTourContactHref(listingPropertyId);
    return { kind: "link", href, label: messageLabel, dataAttr: "listing-room-browser-message" };
  };

  return (
    <ListingSpaceMediaBrowser
      entries={mediaEntries}
      testId="listing-room-media-browser"
      itemNoun="room"
      availabilityVariant="room"
      onEntryPress={
        onOpenDetails
          ? (_, index) => {
              const entry = entries[index];
              if (entry) onOpenDetails(entry);
            }
          : undefined
      }
      detailsActionLabel="Room details"
      resolvePrimaryCta={
        onOpenDetails
          ? undefined
          : (_, index) => resolvePrimaryCta(entries[index]?.room.id ?? "", index)
      }
      resolveSecondaryCta={
        onOpenDetails
          ? undefined
          : (_, index) => resolveSecondaryCta(entries[index]?.room.id ?? "", index)
      }
      className={className}
    />
  );
}