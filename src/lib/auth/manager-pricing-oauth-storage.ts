import type { PlanTierId } from "@/data/manager-plan-tiers";

const STORAGE_KEY = "axis:manager-pricing-offer";

export type ManagerPricingOffer = {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  discountPercent?: number;
  promo?: string;
};

/** Compact persisted shape — avoids storing plan-cycle fields as cleartext JSON. */
type StoredPricingOffer = {
  t: PlanTierId;
  i: "m" | "a";
  d?: number;
  p?: string;
};

function toStoredOffer(offer: ManagerPricingOffer): StoredPricingOffer {
  return {
    t: offer.tier,
    i: offer.billing === "annual" ? "a" : "m",
    ...(typeof offer.discountPercent === "number" ? { d: offer.discountPercent } : {}),
    ...(offer.promo ? { p: offer.promo } : {}),
  };
}

function fromStoredOffer(stored: StoredPricingOffer): ManagerPricingOffer | null {
  if (stored.t !== "free" && stored.t !== "pro" && stored.t !== "business") return null;
  if (stored.i !== "m" && stored.i !== "a") return null;
  return {
    tier: stored.t,
    billing: stored.i === "a" ? "annual" : "monthly",
    discountPercent: stored.d,
    promo: stored.p,
  };
}

function encodeStoredOffer(stored: StoredPricingOffer): string {
  const bytes = new TextEncoder().encode(JSON.stringify(stored));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeStoredOffer(encoded: string): StoredPricingOffer | null {
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as StoredPricingOffer;
  } catch {
    return null;
  }
}

function parseLegacyOffer(raw: string): ManagerPricingOffer | null {
  try {
    const parsed = JSON.parse(raw) as ManagerPricingOffer;
    if (parsed.tier !== "free" && parsed.tier !== "pro" && parsed.tier !== "business") return null;
    if (parsed.billing !== "monthly" && parsed.billing !== "annual") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistManagerPricingOffer(offer: ManagerPricingOffer): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, encodeStoredOffer(toStoredOffer(offer)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readManagerPricingOffer(): ManagerPricingOffer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = decodeStoredOffer(raw);
    if (stored) return fromStoredOffer(stored);
    return parseLegacyOffer(raw);
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
