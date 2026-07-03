"use client";

import { Button } from "@/components/ui/button";
import {
  listingLinkTargetProps,
  useListingPreviewNewTab,
} from "@/components/marketing/listing-preview-context";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import Link from "next/link";

export function PropertyDetailActions({ propertyId }: { propertyId: string }) {
  const newTabProps = listingLinkTargetProps(useListingPreviewNewTab());
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Link href={`/rent/tours-contact?propertyId=${encodeURIComponent(propertyId)}`} {...newTabProps}>
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          Schedule tour
        </Button>
      </Link>
      <Link href={buildRentalApplyHref({ propertyId })} {...newTabProps}>
        <Button type="button" className="w-full sm:w-auto">
          Apply
        </Button>
      </Link>
    </div>
  );
}
