import type { PlanTierId } from "@/data/manager-plan-tiers";

export type ManagerOnboardTier = {
  id: PlanTierId;
  label: string;
  description: string;
  noCard: boolean;
};

export const MANAGER_ONBOARD_TIERS: ManagerOnboardTier[] = [
  {
    id: "free",
    label: "Free",
    description: "One property listing, applications, tours, and payments. No card required.",
    noCard: true,
  },
  {
    id: "pro",
    label: "Pro",
    description: "Residents, leases, services, inbox, and up to two co-managers.",
    noCard: false,
  },
  {
    id: "business",
    label: "Business",
    description: "Portfolio scale — 20 properties, 20 co-managers, and priority support.",
    noCard: false,
  },
];

export function isManagerOnboardTier(tier: string): tier is PlanTierId {
  return tier === "free" || tier === "pro" || tier === "business";
}

export function buildManagerOnboardPath(tier: PlanTierId): string {
  return `/onboard/${tier}`;
}

export function buildManagerOnboardUrl(origin: string, tier: PlanTierId): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${buildManagerOnboardPath(tier)}`;
}

export function buildManagerPricingPath(tier: PlanTierId): string {
  return `/partner/pricing?tier=${tier}`;
}
