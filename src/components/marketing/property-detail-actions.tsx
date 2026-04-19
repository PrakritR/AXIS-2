import { Button } from "@/components/ui/button";
import { buildRentalApplyHref } from "@/lib/rental-application/apply-from-listing";
import Link from "next/link";

export function PropertyDetailActions({ propertyId }: { propertyId: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Link href="/rent/listings">
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          Browse all rooms
        </Button>
      </Link>
      <Link href="/rent/tours-contact">
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          Schedule tour
        </Button>
      </Link>
      <Link href={buildRentalApplyHref({ propertyId })}>
        <Button type="button" className="w-full sm:w-auto">
          Apply
        </Button>
      </Link>
    </div>
  );
}
