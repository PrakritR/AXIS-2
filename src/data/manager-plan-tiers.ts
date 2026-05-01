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
      sub: "List properties, run applications, and schedule tours — 1 property.",
    },
    annual: {
      headline: "Free",
      period: null,
      sub: "List properties, run applications, and schedule tours — 1 property.",
    },
    features: [
      { text: "1 active property listing", included: true },
      { text: "Applications & touring (calendar)", included: true },
      { text: "No Axis platform fees", included: true },
      { text: "Resident tab (leases, work orders)", included: false },
      { text: "Inbox & account links", included: false },
    ],
  },
  {
    id: "pro",
    label: "Pro",
    monthly: {
      headline: "$20",
      period: "/ mo",
      sub: "Full resident management — leases, work orders, inbox, and account links.",
    },
    annual: {
      headline: "$192",
      period: "/ yr",
      sub: "Same as monthly, ~20% off when billed annually.",
    },
    features: [
      { text: "Up to 2 properties · 2 linked owners · 2 linked managers", included: true },
      { text: "Resident tab: lease generation & work orders", included: true },
      { text: "Inbox & account links", included: true },
      { text: "No Axis platform fees", included: true },
    ],
  },
  {
    id: "business",
    label: "Business",
    monthly: {
      headline: "$200",
      period: "/ mo",
      sub: "Portfolio scale — 20 properties, 20 owners, 20 managers.",
    },
    annual: {
      headline: "$1,920",
      period: "/ yr",
      sub: "Same as monthly, ~20% off when billed annually.",
    },
    features: [
      { text: "Up to 20 properties · 20 owner links · 20 manager links", included: true },
      { text: "All Pro features — full portal", included: true },
      { text: "No Axis platform fees", included: true },
      { text: "Priority admin support", included: true },
    ],
  },
];
