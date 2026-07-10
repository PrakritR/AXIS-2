"use client";

import { RentalApplicationWizard } from "@/components/marketing/rental-application-wizard";
import { useAppUi } from "@/components/providers/app-ui-provider";

/** Public guest apply surface — no account required. */
export function PublicApplyClient() {
  const { showToast } = useAppUi();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <RentalApplicationWizard showToast={showToast} mode="public" exitPath="/rent/browse" />
    </div>
  );
}
