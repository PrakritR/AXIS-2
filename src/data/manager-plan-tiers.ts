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
      sub: "Core operations with strict limits — 1 property, no lease pipeline.",
    },
    annual: {
      headline: "Free",
      period: null,
      sub: "Core operations with strict limits — 1 property, no lease pipeline.",
    },
    features: [
      { text: "1 active property (1 house)", included: true },
      { text: "Applications, payments, calendar, inbox, account links (1 manager + 1 owner)", included: true },
      { text: "Axis platform fee: 2% on application fees · 0.25% on rent", included: true },
      { text: "Lease pipeline", included: false },
      { text: "Work orders", included: false },
    ],
  },
  {
    id: "pro",
    label: "Pro",
    monthly: {
      headline: "$20",
      period: "/ mo",
      sub: "Two properties, richer collaboration, full operational suite.",
    },
    annual: {
      headline: "$192",
      period: "/ yr",
      sub: "Same as monthly, ~20% off when billed annually.",
    },
    features: [
      { text: "Up to 2 properties · up to 2 linked owners · up to 2 linked managers", included: true },
      { text: "Lease pipeline, work orders, calendar, inbox — all features", included: true },
      { text: "Axis platform fee: 2% on application fees · 0% on rent", included: true },
    ],
  },
  {
    id: "business",
    label: "Business",
    monthly: {
      headline: "$200",
      period: "/ mo",
      sub: "Portfolio scale — 20 units, 20 owners, 20 managers, no Axis take on payments.",
    },
    annual: {
      headline: "$1,920",
      period: "/ yr",
      sub: "Same as monthly, ~20% off when billed annually.",
    },
    features: [
      { text: "Up to 20 properties · 20 owner links · 20 manager links", included: true },
      { text: "All Pro features — full portal", included: true },
      { text: "Axis platform fee: 0% on application fees · 0% on rent", included: true },
      { text: "Priority admin support", included: true },
    ],
  },
];
