"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RentalApplicationWizard } from "@/components/marketing/rental-application-wizard";
import { PublicApplyAccountPrompt } from "@/components/marketing/public-apply-account-prompt";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { getPropertyForPublicLink } from "@/lib/rental-application/data";
import { hasPublicApplyGuestContinue } from "@/lib/rental-application/public-apply-session";

/** Public guest apply surface — account recommended, not required. */
export function PublicApplyClient() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const propertyId = searchParams.get("propertyId")?.trim() ?? "";
  const propertyTitle = useMemo(() => {
    if (!propertyId) return undefined;
    return getPropertyForPublicLink(propertyId)?.title?.trim();
  }, [propertyId]);
  const [guestGateOpen, setGuestGateOpen] = useState(() =>
    propertyId ? !hasPublicApplyGuestContinue(propertyId) : false,
  );

  const showAccountPrompt = Boolean(propertyId) && guestGateOpen;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {showAccountPrompt ? (
        <PublicApplyAccountPrompt
          propertyId={propertyId}
          propertyTitle={propertyTitle}
          onContinueGuest={() => setGuestGateOpen(false)}
        />
      ) : null}
      {!showAccountPrompt ? (
        <RentalApplicationWizard showToast={showToast} mode="public" exitPath="/rent/browse" />
      ) : null}
    </div>
  );
}
