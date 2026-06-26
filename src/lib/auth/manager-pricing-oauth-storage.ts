import type { PlanTierId } from "@/data/manager-plan-tiers";

const STORAGE_KEY = "axis:manager-pricing-offer";

export type ManagerPricingOffer = {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  discountPercent?: number;
  promo?: string;
};

export function persistManagerPricingOffer(offer: ManagerPricingOffer): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(offer));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readManagerPricingOffer(): ManagerPricingOffer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManagerPricingOffer;
    if (parsed.tier !== "free" && parsed.tier !== "pro" && parsed.tier !== "business") return null;
    if (parsed.billing !== "monthly" && parsed.billing !== "annual") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearManagerPricingOffer(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
