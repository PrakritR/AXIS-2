"use client";

import {
  listingLinkTargetProps,
  useListingPreviewNewTab,
} from "@/components/marketing/listing-preview-context";
import { buildSmsDeepLink, isClawMessagingPubliclyEnabled } from "@/lib/claw-leasing-links";
import { buildTourContactHref } from "@/lib/manager-property-links";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import Link from "next/link";

const ctaBase =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition sm:w-auto";

export function PropertyDetailActions({
  propertyId,
  propertyLabel,
}: {
  propertyId: string;
  propertyLabel?: string;
}) {
  const newTabProps = listingLinkTargetProps(useListingPreviewNewTab());
  const applyHref = buildRentalApplyHref({ propertyId });
  const tourHref = buildTourContactHref(propertyId, { next: applyHref });
  const textEnabled = isClawMessagingPubliclyEnabled();
  const textTourHref = textEnabled
    ? buildSmsDeepLink({ intent: "tour", propertyId, propertyLabel })
    : null;
  const textApplyHref = textEnabled
    ? buildSmsDeepLink({ intent: "apply", propertyId, propertyLabel })
    : null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {textTourHref ? (
        <a
          href={textTourHref}
          data-attr="listing-text-tour"
          className={`${ctaBase} border border-border bg-card text-foreground hover:bg-accent/30`}
        >
          Text to tour
        </a>
      ) : null}
      <Link
        href={tourHref}
        data-attr="listing-schedule-tour"
        className={`${ctaBase} border border-border bg-card text-foreground hover:bg-accent/30`}
        {...newTabProps}
      >
        Schedule tour
      </Link>
      {textApplyHref ? (
        <a
          href={textApplyHref}
          data-attr="listing-text-apply"
          className={`${ctaBase} bg-primary text-primary-foreground shadow-[0_4px_20px_rgba(47,107,255,0.28)] hover:opacity-95`}
        >
          Text to apply
        </a>
      ) : null}
      <Link
        href={applyHref}
        data-attr="listing-apply-online"
        className={`${ctaBase} ${textApplyHref ? "border border-border bg-card text-foreground hover:bg-accent/30" : "bg-primary text-primary-foreground shadow-[0_4px_20px_rgba(47,107,255,0.28)] hover:opacity-95"}`}
        {...newTabProps}
      >
        Apply online
      </Link>
    </div>
  );
}