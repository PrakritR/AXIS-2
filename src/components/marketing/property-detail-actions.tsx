"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function PropertyDetailActions({ propertyId }: { propertyId: string }) {
  const { showToast } = useAppUi();
  const listingPath = `/rent/listings/${propertyId}`;

  const copyListingLink = async () => {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}${listingPath}` : listingPath;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Listing link copied");
    } catch {
      showToast("Could not copy link");
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Link href="/rent/listings">
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          Properties
        </Button>
      </Link>
      <Link href="/rent/tours-contact">
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          Schedule tour
        </Button>
      </Link>
      <Link href="/rent/apply">
        <Button type="button" className="w-full sm:w-auto">
          Apply
        </Button>
      </Link>
      <Link href="/rent/contact">
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          Contact us
        </Button>
      </Link>
      <Button type="button" variant="ghost" className="w-full font-semibold text-primary sm:w-auto" onClick={copyListingLink}>
        Share
      </Button>
    </div>
  );
}
