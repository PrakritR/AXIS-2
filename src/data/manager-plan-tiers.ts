/** Shared copy for manager/owner Plan page — keep amounts aligned with `partner/pricing` and `MANAGER_TIER_MONTHLY_USD`. */

export type PlanTierId = "free" | "pro" | "business";

export type PlanPriceBlock = {
  headline: string;
  period: string | null;
  sub: string;
};

export type ManagerPlanTierDefinition = {
  id: PlanTierId;
  label: string;
  monthly: PlanPriceBlock;
  annual: PlanPriceBlock;
  features: { text: string; included: boolean }[];
};

export const MANAGER_PLAN_TIERS: ManagerPlanTierDefinition[] = [
  {
    id: "free",
    label: "Free",
    monthly: {
      headline: "Free",
      period: null,
      sub: "List properties, collect rent, and run applications.",
    },
    annual: {
      headline: "Free",
      period: null,
      sub: "List properties, collect rent, and run applications.",
    },
    features: [
      { text: "Property listings", included: true },
      { text: "Rent collection & payments", included: true },
      { text: "Applications", included: true },
      { text: "Lease pipeline & documents", included: false },
      { text: "Work orders & calendar", included: false },
    ],
  },
  {
    id: "pro",
    label: "Pro",
    monthly: {
      headline: "$20",
      period: "/ mo",
      sub: "Full manager portal for growing operators — up to 2 properties.",
    },
    annual: {
      headline: "$192",
      period: "/ yr",
      sub: "Same as monthly, ~20% off when billed annually.",
    },
    features: [
      { text: "Everything in Free", included: true },
      { text: "Leases & lease pipeline", included: true },
      { text: "Work orders", included: true },
      { text: "Calendar & inbox", included: true },
      { text: "Up to 2 properties", included: true },
    ],
  },
  {
    id: "business",
    label: "Business",
    monthly: {
      headline: "$200",
      period: "/ mo",
      sub: "Unlimited scale and priority support — up to 20 properties.",
    },
    annual: {
      headline: "$1,920",
      period: "/ yr",
      sub: "Same as monthly, ~20% off when billed annually.",
    },
    features: [
      { text: "Everything in Pro", included: true },
      { text: "Up to 20 properties", included: true },
      { text: "Priority admin support", included: true },
    ],
  },
];
