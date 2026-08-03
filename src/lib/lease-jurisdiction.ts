import disclosureClauseRules from "../../leases/disclosure-clause-rules.json";
import {
  LEASE_JURISDICTION_TEMPLATE_REGISTRY,
  type LeaseJurisdictionTemplateConfig,
  type LeaseJurisdictionRegistryEntry,
} from "@/lib/lease-templates/types";

export type LeaseJurisdiction =
  | "seattle"
  | "san_francisco"
  | "california"
  | "washington"
  | "unsupported";

/** State is a two-letter USPS abbreviation; city is a normalized registry key when present. */
export type JurisdictionKey = { state: string; city?: string };

type LeaseAddress = {
  address?: string;
  city?: string;
  state?: string;
  neighborhood?: string;
  zip?: string;
  postalCode?: string;
};

export type LeaseJurisdictionInput = {
  listingProperty?: LeaseAddress & { neighborhood?: string } | null;
  leasedRoom?: LeaseAddress & { neighborhood?: string } | null;
  submission?: LeaseAddress & { neighborhood?: string } | null;
  application?: { currentCity?: string; currentState?: string } | null;
};

const SEATTLE_RE = /\bseattle\b/i;
const SEATTLE_STREET_RE = /\b(?:\d+\s+)?[\w\s]{0,40}\bave\s+ne\b/i;
const SF_RE = /\b(san\s*francisco|sf,\s*ca|,\s*sf\b)\b/i;

function propertyHaystack(ctx: LeaseJurisdictionInput): string {
  return [
    ctx.submission?.address,
    ctx.submission?.city,
    ctx.submission?.state,
    ctx.submission?.zip,
    ctx.submission?.postalCode,
    ctx.listingProperty?.address,
    ctx.listingProperty?.city,
    ctx.listingProperty?.state,
    ctx.listingProperty?.neighborhood,
    ctx.listingProperty?.zip,
    ctx.listingProperty?.postalCode,
    ctx.submission?.neighborhood,
    ctx.leasedRoom?.address,
    ctx.leasedRoom?.city,
    ctx.leasedRoom?.state,
    ctx.leasedRoom?.neighborhood,
    ctx.leasedRoom?.zip,
    ctx.leasedRoom?.postalCode,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function haystackFromContext(ctx: LeaseJurisdictionInput): string {
  const property = propertyHaystack(ctx);
  const applicant = [ctx.application?.currentCity, ctx.application?.currentState].filter(Boolean).join(" ").toLowerCase();
  return [property, applicant].filter(Boolean).join(" ");
}

function normalizedState(value: string | undefined): string | null {
  const state = value?.trim().toUpperCase();
  if (state === "CA" || state === "CALIFORNIA") return "CA";
  if (state === "WA" || state === "WASHINGTON") return "WA";
  return null;
}

function normalizedCity(value: string | undefined): string | null {
  const city = value?.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (city === "san francisco" || city === "sf") return "san_francisco";
  if (city === "seattle") return "seattle";
  return null;
}

function jurisdictionKey(state: string | null, city: string | null): JurisdictionKey | null {
  if (!state) return null;
  const stateEntry = LEASE_JURISDICTION_TEMPLATE_REGISTRY[state];
  if (!stateEntry) return null;
  if (city && stateEntry.cities?.[city]) return { state, city };
  return { state };
}

function addressHaystack(address: LeaseAddress | null | undefined): string {
  return [address?.address, address?.city, address?.state, address?.neighborhood, address?.zip, address?.postalCode]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function structuredPropertyJurisdiction(ctx: LeaseJurisdictionInput): JurisdictionKey | null {
  const addresses: Array<LeaseAddress | null | undefined> = [ctx.listingProperty, ctx.leasedRoom, ctx.submission];
  for (const address of addresses) {
    const state = normalizedState(address?.state);
    const city = normalizedCity(address?.city);
    if (!state) continue;
    // A populated structured city is authoritative even when it has no local overlay. A
    // Fremont record, for example, must not inherit a stale "San Francisco" address string.
    if (address?.city?.trim()) return jurisdictionKey(state, city);
    // Some future record shapes may provide state separately but leave city joined into the
    // street address. In that case, retain the city-level match when it corroborates the state.
    const joined = resolveFromHaystack(addressHaystack(address));
    if (joined?.state === state && joined.city) return joined;
    return jurisdictionKey(state, null);
  }
  return null;
}

function stateSignalFromHaystack(hay: string): string | null {
  const hasWashington = /\b(wa|washington)\b/i.test(hay);
  const hasCalifornia = /\b(ca|california)\b/i.test(hay);
  if (hasWashington === hasCalifornia) return null;
  return hasWashington ? "WA" : "CA";
}

function resolveFromHaystack(hay: string): JurisdictionKey | null {
  if (!hay.trim()) return null;
  const stateSignal = stateSignalFromHaystack(hay);
  if (SF_RE.test(hay)) return stateSignal && stateSignal !== "CA" ? { state: stateSignal } : { state: "CA", city: "san_francisco" };
  if (SEATTLE_RE.test(hay) || SEATTLE_STREET_RE.test(hay)) {
    return stateSignal && stateSignal !== "WA" ? { state: stateSignal } : { state: "WA", city: "seattle" };
  }
  // Seattle / SF metro ZIPs when address omits city/state (e.g. Brooklyn Ave NE, 98105).
  if (/\b981\d{2}\b/.test(hay)) return stateSignal && stateSignal !== "WA" ? { state: stateSignal } : { state: "WA", city: "seattle" };
  if (/\b941\d{2}\b/.test(hay)) return stateSignal && stateSignal !== "CA" ? { state: stateSignal } : { state: "CA", city: "san_francisco" };
  // State-only signal, no city match above: use the statewide template. Never assume the
  // state's largest city, which would put its municipal ordinance on someone else's lease.
  if (stateSignal) return { state: stateSignal };
  return null;
}

/** Resolve a property location to a supported state config and optional city overlay. */
export function resolveJurisdiction(ctx: LeaseJurisdictionInput): JurisdictionKey | null {
  const structured = structuredPropertyJurisdiction(ctx);
  if (structured) return structured;
  const propertyHay = propertyHaystack(ctx);
  if (propertyHay.trim()) return resolveFromHaystack(propertyHay);
  return resolveFromHaystack(haystackFromContext(ctx));
}

/** Returns the applicable state config, using a city overlay only when it is registered. */
export function jurisdictionConfig(key: JurisdictionKey): LeaseJurisdictionTemplateConfig | null {
  const entry = LEASE_JURISDICTION_TEMPLATE_REGISTRY[normalizedState(key.state) ?? ""];
  if (!entry) return null;
  const city = normalizedCity(key.city);
  return city && entry.cities?.[city] ? entry.cities[city].config : entry.config;
}

type DisclosureCatalog = {
  jurisdiction_inheritance?: Record<string, string[]>;
};

const JURISDICTION_INHERITANCE = (disclosureClauseRules as DisclosureCatalog).jurisdiction_inheritance ?? {};

function registryEntry(key: JurisdictionKey): LeaseJurisdictionRegistryEntry | null {
  return LEASE_JURISDICTION_TEMPLATE_REGISTRY[normalizedState(key.state) ?? ""] ?? null;
}

/**
 * Disclosure scopes for this location. City inheritance comes directly from the rules
 * catalog; state locations receive the federal scope plus their registry-declared state scope.
 */
export function jurisdictionRuleScopes(key: JurisdictionKey): string[] {
  const entry = registryEntry(key);
  if (!entry) return [];
  const city = normalizedCity(key.city);
  const cityScope = city ? entry.cities?.[city]?.ruleScope : undefined;
  if (cityScope) return [...(JURISDICTION_INHERITANCE[cityScope] ?? [])];
  return ["federal", entry.ruleScope];
}

export function jurisdictionKeyToLegacy(key: JurisdictionKey | null): LeaseJurisdiction {
  if (!key) return "unsupported";
  if (key.state === "CA" && key.city === "san_francisco") return "san_francisco";
  if (key.state === "WA" && key.city === "seattle") return "seattle";
  if (key.state === "CA") return "california";
  if (key.state === "WA") return "washington";
  return "unsupported";
}

/** Compatibility adapter for legacy callers. New code should use `resolveJurisdiction`. */
export function resolveLeaseJurisdiction(ctx: LeaseJurisdictionInput): LeaseJurisdiction {
  return jurisdictionKeyToLegacy(resolveJurisdiction(ctx));
}

export function jurisdictionLabel(j: LeaseJurisdiction): string {
  if (j === "seattle") return "Seattle, WA";
  if (j === "san_francisco") return "San Francisco, CA";
  if (j === "washington") return "Washington";
  if (j === "california") return "California";
  return "Unsupported";
}

export function isLeaseGenerationSupported(j: LeaseJurisdiction): boolean {
  return j !== "unsupported";
}

export function unsupportedJurisdictionMessage(j: LeaseJurisdiction = "unsupported"): string {
  void j;
  return "Lease generation is only available for California and Washington properties. Upload a PDF lease for other locations.";
}
