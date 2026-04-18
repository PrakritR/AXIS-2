import { Button } from "@/components/ui/button";
import Link from "next/link";

export function PropertyDetailActions({ propertyId: _propertyId }: { propertyId: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Link href="/rent/listings">
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          View all properties
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
    </div>
  );
}
