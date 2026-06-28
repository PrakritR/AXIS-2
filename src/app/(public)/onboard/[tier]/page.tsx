import {
  buildManagerPricingPath,
  isManagerOnboardTier,
  parseOnboardOfferSearchParams,
} from "@/lib/manager-onboard-links";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ tier: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ManagerOnboardTierPage({ params, searchParams }: PageProps) {
  const { tier } = await params;
  if (!isManagerOnboardTier(tier)) notFound();
  const offer = parseOnboardOfferSearchParams(await searchParams);
  redirect(buildManagerPricingPath(tier, offer));
}
