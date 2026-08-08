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
import { listingApplyLabel, listingMessageLabel } from "@/lib/listing-prospect-cta-labels";
import { useProspectListingHrefs } from "@/hooks/use-prospect-listing-hrefs";

function useLeasingLabels(contactSmsPhone: string | null | undefined) {
  const textEnabled = isClawMessagingPubliclyEnabled(contactSmsPhone);
  return {
    textEnabled,
    applyLabel: listingApplyLabel(textEnabled),
    messageLabel: listingMessageLabel(textEnabled),
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
  const {
    applyHref: webApplyHref,
    messageHref: webMessageHref,
    stageMessageCompose,
  } = useProspectListingHrefs(listingPropertyId);
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
          intent: "apply",
          propertyId: listingPropertyId,
          propertyLabel: label,
          toPhone: contactSmsPhone,
        })
      : webApplyHref;
    return { kind: "link", href, label: applyLabel, dataAttr: "listing-bathroom-browser-apply" };
  };

  const resolveSecondaryCta = (index: number): ListingSpaceMediaCta => {
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
    return {
      kind: "link",
      href,
      label: messageLabel,
      dataAttr: "listing-bathroom-browser-message",
      onClick: textEnabled ? undefined : stageMessageCompose,
    };
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
      resolvePrimaryCta={(_, index) => resolvePrimaryCta(index)}
      resolveSecondaryCta={(_, index) => resolveSecondaryCta(index)}
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
  const {
    applyHref: webApplyHref,
    messageHref: webMessageHref,
    stageMessageCompose,
  } = useProspectListingHrefs(listingPropertyId);
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

  const resolveSecondaryCta = (): ListingSpaceMediaCta => {
    const href = textEnabled
      ? buildSmsDeepLink({
          intent: "question",
          propertyId: listingPropertyId,
          propertyLabel: label,
          toPhone: contactSmsPhone,
        })
      : webMessageHref;
    return {
      kind: "link",
      href,
      label: messageLabel,
      dataAttr: "listing-shared-browser-message",
      onClick: textEnabled ? undefined : stageMessageCompose,
    };
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
      resolvePrimaryCta={() => resolvePrimaryCta()}
      resolveSecondaryCta={() => resolveSecondaryCta()}
      className={className}
    />
  );
}
