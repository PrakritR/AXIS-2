"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";
import { RentalApplicationWizard } from "@/components/marketing/rental-application-wizard";

export default function ApplyPage() {
  const { showToast } = useAppUi();
  return <RentalApplicationWizard showToast={showToast} />;
}
