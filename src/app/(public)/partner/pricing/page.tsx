"use client";

import { ManagerStartPage } from "@/components/marketing/manager-start-page";

/** Kept at its own path for OAuth returns, ad deep links, and other hardcoded /partner/pricing
 * redirects — renders the same component as the Manager top-nav tab (/partner). */
export default function PartnerPricingPage() {
  return <ManagerStartPage />;
}
