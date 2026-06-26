import { isManagerOnboardTier, buildManagerPricingPath } from "@/lib/manager-onboard-links";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ tier: string }>;
};

export default async function ManagerOnboardTierPage({ params }: PageProps) {
  const { tier } = await params;
  if (!isManagerOnboardTier(tier)) notFound();
  redirect(buildManagerPricingPath(tier));
}
