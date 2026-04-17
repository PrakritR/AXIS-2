"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function PropertyDetailActions({ propertyId }: { propertyId: string }) {
  const { showToast, openModal } = useAppUi();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Link href="/rent/apply">
        <Button type="button" className="w-full sm:w-auto">
          Apply now
        </Button>
      </Link>
      <Link href="/rent/tours">
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          Schedule tour
        </Button>
      </Link>
      <Link href="/rent/contact">
        <Button type="button" variant="outline" className="w-full sm:w-auto">
          Contact us
        </Button>
      </Link>
      <Button
        type="button"
        variant="ghost"
        className="w-full sm:w-auto"
        onClick={() => showToast(`Saved property ${propertyId} (demo)`)}
      >
        Save property
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full sm:w-auto"
        onClick={() =>
          openModal({
            title: "Share property",
            body: "Share sheet will deep-link to listings when wired up.",
          })
        }
      >
        Share
      </Button>
    </div>
  );
}
