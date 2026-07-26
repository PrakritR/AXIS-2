"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RentalApplicationWizard } from "@/components/marketing/rental-application-wizard";
import { PublicApplyAccountPrompt } from "@/components/marketing/public-apply-account-prompt";
import { SignedInResidentAccountPrompt } from "@/components/marketing/signed-in-resident-account-prompt";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { getPropertyForPublicLink } from "@/lib/rental-application/data";
import {
  hasPublicApplyGuestContinue,
  resolvePublicApplyView,
} from "@/lib/rental-application/public-apply-session";

/**
 * Public guest apply surface — account recommended, not required.
 *
 * `signedInNonResident` is resolved on the server (authoritative role check):
 * a signed-in manager/vendor is offered a separate resident account rather than
 * the anonymous sign-in nudge, and never a blank screen. A signed-in resident
 * is redirected to the portal apply flow before this component mounts.
 */
export function PublicApplyClient({ signedInNonResident = false }: { signedInNonResident?: boolean }) {
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

  const view = resolvePublicApplyView({
    propertyId,
    guestContinue: !guestGateOpen,
    signedInNonResident,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {view === "signed-in-create-resident" ? (
        <SignedInResidentAccountPrompt
          propertyId={propertyId}
          propertyTitle={propertyTitle}
          onContinueGuest={() => setGuestGateOpen(false)}
        />
      ) : view === "account-prompt" ? (
        <PublicApplyAccountPrompt
          propertyId={propertyId}
          propertyTitle={propertyTitle}
          onContinueGuest={() => setGuestGateOpen(false)}
        />
      ) : (
        <RentalApplicationWizard showToast={showToast} mode="public" exitPath="/rent/browse" />
      )}
    </div>
  );
}
