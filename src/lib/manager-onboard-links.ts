import type { PlanTierId } from "@/data/manager-plan-tiers";

export type ManagerOnboardTier = {
  id: PlanTierId;
  label: string;
  noCard: boolean;
};

export const MANAGER_ONBOARD_TIERS: ManagerOnboardTier[] = [
  {
    id: "free",
    label: "Free",
    noCard: true,
  },
  {
    id: "pro",
    label: "Pro",
    noCard: false,
  },
  {
    id: "business",
    label: "Business",
    noCard: false,
  },
];

export type OnboardLinkOffer = {
  /** 1–100. 100 skips Stripe (free signup on a paid tier). */
  discountPercent?: number | null;
  billing?: "monthly" | "annual";
  promo?: string;
};

export function isManagerOnboardTier(tier: string): tier is PlanTierId {
  return tier === "free" || tier === "pro" || tier === "business";
}

function appendSearchParams(path: string, params: URLSearchParams): string {
  const qs = params.toString();
  if (!qs) return path;
  return `${path}?${qs}`;
}

export function buildOnboardOfferSearchParams(offer?: OnboardLinkOffer): URLSearchParams {
  const params = new URLSearchParams();
  if (!offer) return params;

  const discount = offer.discountPercent;
  if (typeof discount === "number" && Number.isFinite(discount) && discount > 0) {
    params.set("d", String(Math.min(100, Math.max(1, Math.round(discount)))));
  }
  if (offer.billing === "monthly" || offer.billing === "annual") {
    params.set("billing", offer.billing);
  }
  const promo = offer.promo?.trim();
  if (promo) params.set("promo", promo);

  return params;
}

export function parseOnboardOfferSearchParams(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
): OnboardLinkOffer {
  const get = (key: string): string | undefined => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key) ?? undefined;
    }
    const raw = searchParams[key];
    if (Array.isArray(raw)) return raw[0];
    return raw;
  };

  const offer: OnboardLinkOffer = {};
  const dRaw = get("d");
  if (dRaw) {
    const n = Number.parseInt(dRaw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 100) offer.discountPercent = n;
  }

  const billing = get("billing");
  if (billing === "monthly" || billing === "annual") offer.billing = billing;

  const promo = get("promo")?.trim();
  if (promo) offer.promo = promo;

  return offer;
}

export function buildManagerOnboardPath(tier: PlanTierId, offer?: OnboardLinkOffer): string {
  return appendSearchParams(`/onboard/${tier}`, buildOnboardOfferSearchParams(offer));
}

export function buildManagerOnboardUrl(origin: string, tier: PlanTierId, offer?: OnboardLinkOffer): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${buildManagerOnboardPath(tier, offer)}`;
}

export function buildManagerPricingPath(tier: PlanTierId, offer?: OnboardLinkOffer): string {
  const params = new URLSearchParams();
  params.set("tier", tier);
  const offerParams = buildOnboardOfferSearchParams(offer);
  offerParams.forEach((value, key) => params.set(key, value));
  return `/partner/pricing?${params.toString()}`;
}
