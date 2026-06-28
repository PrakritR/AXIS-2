import type { PlanTierId } from "@/data/manager-plan-tiers";
import type { NextRequest, NextResponse } from "next/server";

const STORAGE_KEY = "axis:manager-pricing-offer";
export const PRICING_OFFER_COOKIE = "axis_pricing_offer";
const COOKIE_MAX_AGE_SEC = 600;

export type ManagerPricingOffer = {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  discountPercent?: number;
  promo?: string;
  /** Where Google OAuth should return after partner-pricing callback. */
  returnSurface?: "mobile-plan" | "partner-pricing";
};

/** Compact persisted shape — avoids storing plan-cycle fields as cleartext JSON. */
type StoredPricingOffer = {
  t: PlanTierId;
  i: "m" | "a";
  d?: number;
  p?: string;
  s?: "m" | "p";
};

function toStoredOffer(offer: ManagerPricingOffer): StoredPricingOffer {
  return {
    t: offer.tier,
    i: offer.billing === "annual" ? "a" : "m",
    ...(typeof offer.discountPercent === "number" ? { d: offer.discountPercent } : {}),
    ...(offer.promo ? { p: offer.promo } : {}),
    ...(offer.returnSurface === "mobile-plan" ? { s: "m" } : offer.returnSurface === "partner-pricing" ? { s: "p" } : {}),
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
    returnSurface: stored.s === "m" ? "mobile-plan" : stored.s === "p" ? "partner-pricing" : undefined,
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
    return {
      tier: parsed.tier,
      billing: parsed.billing,
      discountPercent: parsed.discountPercent,
      promo: parsed.promo,
      returnSurface: parsed.returnSurface,
    };
  } catch {
    return null;
  }
}

export function persistManagerPricingOffer(offer: ManagerPricingOffer): void {
  if (typeof window === "undefined") return;
  try {
    const encoded = encodeStoredOffer(toStoredOffer(offer));
    window.sessionStorage.setItem(STORAGE_KEY, encoded);
    document.cookie = `${PRICING_OFFER_COOKIE}=${encodeURIComponent(encoded)}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
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
    document.cookie = `${PRICING_OFFER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function readPricingOfferFromRequest(request: NextRequest): ManagerPricingOffer | null {
  const raw = request.cookies.get(PRICING_OFFER_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const stored = decodeStoredOffer(decoded);
    if (stored) return fromStoredOffer(stored);
    return parseLegacyOffer(decoded);
  } catch {
    return null;
  }
}

export function clearPricingOfferCookie(response: NextResponse): void {
  response.cookies.set(PRICING_OFFER_COOKIE, "", { path: "/", maxAge: 0 });
}
