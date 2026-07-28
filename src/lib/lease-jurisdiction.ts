/**
 * `california` / `washington` are the STATEWIDE fallbacks for a supported state outside the
 * two cities (Fremont CA, Tacoma WA, ...). They exist because the state rules used to fall
 * through to the city templates, so a Fremont lease claimed "City and County of San Francisco"
 * and cited the SF Rent Ordinance. City matches still win; see `resolveFromHaystack`.
 */
export type LeaseJurisdiction =
  | "seattle"
  | "san_francisco"
  | "california"
  | "washington"
  | "unsupported";

export type LeaseJurisdictionInput = {
  listingProperty?: { address?: string; neighborhood?: string; zip?: string } | null;
  leasedRoom?: { address?: string; neighborhood?: string; zip?: string } | null;
  submission?: { address?: string; neighborhood?: string; zip?: string } | null;
  application?: { currentCity?: string; currentState?: string } | null;
};

const SEATTLE_RE = /\bseattle\b/i;
const SEATTLE_STREET_RE = /\b(?:\d+\s+)?[\w\s]{0,40}\bave\s+ne\b/i;
const SF_RE = /\b(san\s*francisco|sf,\s*ca|,\s*sf\b)\b/i;

function propertyHaystack(ctx: LeaseJurisdictionInput): string {
  return [
    ctx.submission?.address,
    ctx.submission?.zip,
    ctx.listingProperty?.address,
    ctx.listingProperty?.neighborhood,
    ctx.listingProperty?.zip,
    ctx.submission?.neighborhood,
    ctx.leasedRoom?.address,
    ctx.leasedRoom?.neighborhood,
    ctx.leasedRoom?.zip,
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

function resolveFromHaystack(hay: string): LeaseJurisdiction {
  if (!hay.trim()) return "unsupported";
  if (SF_RE.test(hay)) return "san_francisco";
  if (SEATTLE_RE.test(hay)) return "seattle";
  if (SEATTLE_STREET_RE.test(hay)) return "seattle";
  if (/\b(or|oregon)\b/i.test(hay)) return "unsupported";
  // Seattle / SF metro ZIPs when address omits city/state (e.g. Brooklyn Ave NE, 98105).
  if (/\b981\d{2}\b/.test(hay)) return "seattle";
  if (/\b941\d{2}\b/.test(hay)) return "san_francisco";
  // State-only signal, no city match above: use the statewide template. Never assume the
  // state's largest city, which would put its municipal ordinance on someone else's lease.
  if (/\b(wa|washington)\b/i.test(hay)) return "washington";
  if (/\b(ca|california)\b/i.test(hay)) return "california";
  return "unsupported";
}

export function resolveLeaseJurisdiction(ctx: LeaseJurisdictionInput): LeaseJurisdiction {
  const propertyHay = propertyHaystack(ctx);
  if (propertyHay.trim()) return resolveFromHaystack(propertyHay);
  return resolveFromHaystack(haystackFromContext(ctx));
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
