"use client";

import { useMemo } from "react";
import type { ListingBathroomRow, ListingSharedRow } from "@/data/listing-rich-content";
import {
  ListingSpaceMediaBrowser,
  type ListingSpaceMediaCta,
} from "@/components/marketing/listing-space-media-browser";
import { bathroomMediaEntries, sharedSpaceMediaEntries } from "@/components/marketing/listing-space-media-entries";
import {
  buildSmsDeepLink,
  isClawMessagingPubliclyEnabled,
} from "@/lib/claw-leasing-links";
import { useProspectListingHrefs } from "@/hooks/use-prospect-listing-hrefs";

function useLeasingLabels(contactSmsPhone: string | null | undefined) {
  const textEnabled = isClawMessagingPubliclyEnabled(contactSmsPhone);
  return {
    textEnabled,
    applyLabel: textEnabled ? "Text to apply" : "Apply online",
    messageLabel: textEnabled ? "Text a message" : "Contact leasing",
  };
}

export function ListingBathroomMediaBrowser({
  rows,
  listingPropertyId,
  propertyLabel = null,
  contactSmsPhone = null,
  onOpenDetails,
  className = "",
}: {
  rows: ListingBathroomRow[];
  listingPropertyId: string;
  propertyLabel?: string | null;
  contactSmsPhone?: string | null;
  onOpenDetails?: (row: ListingBathroomRow) => void;
  className?: string;
}) {
  const { textEnabled, applyLabel, messageLabel } = useLeasingLabels(contactSmsPhone);
  const label = propertyLabel?.trim() || null;
  const { applyHref: webApplyHref, messageHref: webMessageHref } = useProspectListingHrefs(listingPropertyId);
  const entries = useMemo(
    () =>
      [...bathroomMediaEntries(rows)].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [rows],
  );

  const resolvePrimaryCta = (index: number): ListingSpaceMediaCta => {
    const row = rows.find((r) => r.id === entries[index]?.id);
    const href = textEnabled
      ? buildSmsDeepLink({
          intent: "question",
          propertyId: listingPropertyId,
          propertyLabel: label,
          topic: row?.name ?? "this bathroom",
          toPhone: contactSmsPhone,
        })
      : webMessageHref;
    return { kind: "link", href, label: messageLabel, dataAttr: "listing-bathroom-browser-message" };
  };

  const resolveSecondaryCta = (index: number): ListingSpaceMediaCta => {
    const row = rows.find((r) => r.id === entries[index]?.id);
    if (onOpenDetails && row) {
      return {
        kind: "button",
        label: "Full details",
        dataAttr: "listing-bathroom-browser-details",
        onClick: () => onOpenDetails(row),
      };
    }
    const href = textEnabled
      ? buildSmsDeepLink({
          intent: "apply",
          propertyId: listingPropertyId,
          propertyLabel: label,
          toPhone: contactSmsPhone,
        })
      : webApplyHref;
    return { kind: "link", href, label: applyLabel, dataAttr: "listing-bathroom-browser-apply" };
  };

  return (
    <ListingSpaceMediaBrowser
      entries={entries}
      testId="listing-bathroom-media-browser"
      itemNoun="bathroom"
      availabilityVariant="default"
      onEntryPress={
        onOpenDetails
          ? (_, index) => {
              const row = rows.find((r) => r.id === entries[index]?.id);
              if (row) onOpenDetails(row);
            }
          : undefined
      }
      detailsActionLabel="Bathroom details"
      resolvePrimaryCta={
        onOpenDetails ? undefined : (_, index) => resolvePrimaryCta(index)
      }
      resolveSecondaryCta={
        onOpenDetails ? undefined : (_, index) => resolveSecondaryCta(index)
      }
      className={className}
    />
  );
}

export function ListingSharedMediaBrowser({
  rows,
  listingPropertyId,
  propertyLabel = null,
  contactSmsPhone = null,
  onOpenDetails,
  className = "",
}: {
  rows: ListingSharedRow[];
  listingPropertyId: string;
  propertyLabel?: string | null;
  contactSmsPhone?: string | null;
  onOpenDetails?: (row: ListingSharedRow) => void;
  className?: string;
}) {
  const { textEnabled, applyLabel, messageLabel } = useLeasingLabels(contactSmsPhone);
  const label = propertyLabel?.trim() || null;
  const { applyHref: webApplyHref, messageHref: webMessageHref } = useProspectListingHrefs(listingPropertyId);
  const entries = useMemo(
    () =>
      [...sharedSpaceMediaEntries(rows)].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [rows],
  );

  const resolvePrimaryCta = (): ListingSpaceMediaCta => {
    const href = textEnabled
      ? buildSmsDeepLink({
          intent: "apply",
          propertyId: listingPropertyId,
          propertyLabel: label,
          toPhone: contactSmsPhone,
        })
      : webApplyHref;
    return { kind: "link", href, label: applyLabel, dataAttr: "listing-shared-browser-apply" };
  };

  const resolveSecondaryCta = (index: number): ListingSpaceMediaCta => {
    const row = rows.find((r) => r.id === entries[index]?.id);
    if (onOpenDetails && row) {
      return {
        kind: "button",
        label: "Full details",
        dataAttr: "listing-shared-browser-details",
        onClick: () => onOpenDetails(row),
      };
    }
    const href = textEnabled
      ? buildSmsDeepLink({
          intent: "question",
          propertyId: listingPropertyId,
          propertyLabel: label,
          toPhone: contactSmsPhone,
        })
      : webMessageHref;
    return { kind: "link", href, label: messageLabel, dataAttr: "listing-shared-browser-message" };
  };

  return (
    <ListingSpaceMediaBrowser
      entries={entries}
      testId="listing-shared-media-browser"
      itemNoun="shared space"
      availabilityVariant="default"
      onEntryPress={
        onOpenDetails
          ? (_, index) => {
              const row = rows.find((r) => r.id === entries[index]?.id);
              if (row) onOpenDetails(row);
            }
          : undefined
      }
      detailsActionLabel="Space details"
      resolvePrimaryCta={onOpenDetails ? undefined : () => resolvePrimaryCta()}
      resolveSecondaryCta={
        onOpenDetails ? undefined : (_, index) => resolveSecondaryCta(index)
      }
      className={className}
    />
  );
}
