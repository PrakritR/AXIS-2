"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";
import { RentalApplicationWizard } from "@/components/marketing/rental-application-wizard";
import { usePortalSession } from "@/hooks/use-portal-session";

export default function ResidentApplyPage() {
  const { showToast } = useAppUi();
  const { email, ready } = usePortalSession();

  if (!ready) {
    return (
      <div className="flex items-center justify-center px-6 py-16 text-sm text-muted">Loading application…</div>
    );
  }

  return (
    <RentalApplicationWizard
      showToast={showToast}
      mode="portal"
      exitPath="/resident/applications"
      sessionEmail={email ?? undefined}
    />
  );
}
