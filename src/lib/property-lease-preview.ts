import type { MockProperty } from "@/data/types";
import { buildAiGeneratedLeaseHtml, type LeaseGenerationContext } from "@/lib/generated-lease";
import { isLeaseGenerationSupported, jurisdictionLabel, resolveLeaseJurisdiction } from "@/lib/lease-jurisdiction";
import {
  activeCustomLeaseTerms,
  activeLeaseTemplateDoc,
  entireHomeMonthlyRentAmount,
  isEntireHomeListing,
  normalizeManagerListingSubmissionV1,
  resolveAllowedLeaseTerms,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import { formatListingFeeDisplay } from "@/lib/rental-application/listing-fees-display";
import { resolvePropertyLeaseSource, type PropertyLeaseSource } from "@/lib/property-lease-source";

export type PropertyLeasePreviewHint = {
  buildingName?: string;
  unitLabel?: string;
  rentLabel?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Avoid "Seattle, WA, Seattle, WA 98101" when the street line already includes city/state. */
export function formatLeaseAddressForDisplay(
  sub: Pick<ManagerListingSubmissionV1, "address" | "neighborhood" | "zip">,
): { street: string; cityStateZip: string; full: string } {
  const raw = sub.address.trim();
  const zip = sub.zip.trim();
  const neighborhood = sub.neighborhood.trim();
  const defaultCityStateZip = zip ? `Seattle, WA ${zip}` : "Seattle, WA";
  const hasCityState = /\b(seattle|washington|,\s*wa\b)/i.test(raw);

  let street = raw;
  if (hasCityState) {
    street =
      raw
        .replace(/,?\s*seattle,?\s*wa\.?\s*\d{0,5}/i, "")
        .replace(/,?\s*washington/i, "")
        .replace(/\s*,\s*$/, "")
        .trim() || raw;
  }

  let cityStateZip = defaultCityStateZip;
  if (hasCityState) {
    const inline = raw.match(/seattle,?\s*wa\.?\s*\d{5}/i)?.[0];
    cityStateZip = inline ?? (zip && !raw.includes(zip) ? `Seattle, WA ${zip}` : defaultCityStateZip);
  } else if (neighborhood) {
    cityStateZip = zip ? `${neighborhood}, Seattle, WA ${zip}` : `${neighborhood}, Seattle, WA`;
  }

  const full = hasCityState && /\d{5}/.test(raw) ? raw : `${street}, ${cityStateZip}`;
  return { street: street || raw || "—", cityStateZip, full };
}

function formatCustomLeaseClausesHtml(terms: string): string {
  const trimmed = terms.trim();
  if (!trimmed) return "";
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) {
    return paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`).join("\n");
  }
  const lines = trimmed
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    return `<ol>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ol>`;
  }
  return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br/>")}</p>`;
}

/** Synthetic placement context for property-level lease previews (no resident yet). */
export function leasePreviewContextFromSubmission(
  sub: ManagerListingSubmissionV1,
  hint?: PropertyLeasePreviewHint,
): LeaseGenerationContext {
  const normalized = normalizeManagerListingSubmissionV1(sub);
  const firstRoom = normalized.rooms.find((r) => r.name.trim() || r.monthlyRent > 0);
  const unitLabel = hint?.unitLabel?.trim() || firstRoom?.name?.trim() || "Room 1";

  let rentFromListing: string | null = null;
  if (firstRoom && firstRoom.monthlyRent > 0) {
    rentFromListing = `$${firstRoom.monthlyRent.toFixed(2)} / month`;
  } else if (isEntireHomeListing(normalized)) {
    const entireRent = entireHomeMonthlyRentAmount(normalized);
    if (entireRent > 0) rentFromListing = `$${entireRent.toFixed(2)} / month`;
  }

  const allowedTerms = resolveAllowedLeaseTerms(normalized);
  const leaseTerm = allowedTerms[0] ?? "12-Month";
  const buildingName = hint?.buildingName?.trim() || normalized.buildingName.trim() || "Property";
  const rentLabel = rentFromListing || hint?.rentLabel?.trim() || "—";
  const addressLines = formatLeaseAddressForDisplay(normalized);

  const previewId = `preview-${buildingName.replace(/\s+/g, "-").slice(0, 48) || "property"}`;
  const roomChoice1 =
    firstRoom?.id ? `${previewId}${LISTING_ROOM_CHOICE_SEP}${firstRoom.id}` : undefined;

  const listingProperty: MockProperty = {
    id: previewId,
    title: buildingName,
    tagline: normalized.tagline?.trim() || "",
    address: addressLines.street,
    zip: normalized.zip,
    neighborhood: normalized.neighborhood,
    beds: 0,
    baths: 0,
    rentLabel,
    available: "—",
    petFriendly: normalized.petFriendly,
    buildingId: `${previewId}-building`,
    buildingName,
    unitLabel,
    listingSubmission: normalized,
    adminPublishLive: true,
  };

  return {
    application: {
      fullLegalName: "[Resident name]",
      email: "[Resident email]",
      phone: "[Resident phone]",
      leaseTerm,
      leaseStart: "[Placement start date]",
      leaseEnd: leaseTerm === "Month-to-Month" ? "N/A (month-to-month)" : "[Placement end date]",
      roomChoice1,
    },
    leasedRoom: listingProperty,
    listingProperty,
    submission: normalized,
    generatedAtIso: new Date().toISOString(),
  };
}

function customCommentsPreviewHtml(terms: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Custom lease addendum</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1f2430; margin: 32px auto; max-width: 720px; line-height: 1.55; padding: 0 20px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #d8dce4; padding-bottom: 4px; margin-top: 24px; }
  .note { color: #5a6172; font-size: 13px; margin-bottom: 20px; }
  ol { margin: 0.5rem 0 0.5rem 1.25rem; padding: 0; }
  li { margin: 0.35rem 0; font-size: 14px; }
  p { font-size: 14px; }
</style></head><body>
  <h1>Additional Provisions from Property Manager</h1>
  <p class="note">These clauses are merged into the Axis standard lease when a resident is placed at this property.</p>
  <h2>Custom provisions</h2>
  ${formatCustomLeaseClausesHtml(terms)}
  <h2>Electronic signature</h2>
  <p>Landlord and Resident each execute the combined lease document through the Axis portal. The Electronic Signature Certificate is the binding record for both parties.</p>
</body></html>`;
}

function customFormatNoticeHtml(docName: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Custom lease format</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1f2430; margin: 32px auto; max-width: 720px; line-height: 1.55; padding: 0 20px; }
  h1 { font-size: 18px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #d8dce4; padding-bottom: 4px; margin-top: 24px; }
  p { font-size: 14px; }
  .doc { font-weight: 600; }
</style></head><body>
  <h1>Custom lease format</h1>
  <p>Lease template: <span class="doc">${escapeHtml(docName)}</span></p>
  <h2>At placement</h2>
  <p>Axis compiles a placement summary (parties, room, rent, dates) and attaches your PDF as the lease document. Both parties sign once through the Axis portal.</p>
  <h2>Electronic signature</h2>
  <p>The Electronic Signature Certificate appended to the signed copy is the binding record for both parties.</p>
</body></html>`;
}

function tryBuildFullLeasePreview(
  ctx: LeaseGenerationContext,
  source: PropertyLeaseSource,
): { html: string; plainText: string; jurisdictionLabel: string } | null {
  const jurisdiction = resolveLeaseJurisdiction(ctx);
  const jLabel = jurisdictionLabel(jurisdiction);
  if (!isLeaseGenerationSupported(jurisdiction)) return null;
  try {
    const html = buildAiGeneratedLeaseHtml(ctx);
    return { html, plainText: stripLeaseHtmlToPlainText(html), jurisdictionLabel: jLabel };
  } catch {
    if (source === "axis_default") {
      return null;
    }
    return null;
  }
}

export type PropertyLeasePreviewResult = {
  source: PropertyLeaseSource;
  html: string | null;
  plainText: string;
  unsupportedJurisdiction: boolean;
  jurisdictionLabel: string | null;
};

export function buildPropertyLeasePreview(
  sub: ManagerListingSubmissionV1,
  opts?: { hint?: PropertyLeasePreviewHint; demo?: boolean },
): PropertyLeasePreviewResult {
  void opts?.demo;
  const normalized = normalizeManagerListingSubmissionV1(sub);
  const source = resolvePropertyLeaseSource(normalized);

  if (source === "custom_format") {
    const doc = activeLeaseTemplateDoc(normalized);
    if (!doc) {
      return {
        source,
        html: null,
        plainText: "Custom lease format configured — open Edit to upload your PDF template.",
        unsupportedJurisdiction: false,
        jurisdictionLabel: null,
      };
    }
    const plainText = `Lease template: ${doc.name}. Axis adds a placement summary and e-signatures at signing time.`;
    return {
      source,
      html: customFormatNoticeHtml(doc.name),
      plainText,
      unsupportedJurisdiction: false,
      jurisdictionLabel: null,
    };
  }

  const ctx = leasePreviewContextFromSubmission(normalized, opts?.hint);
  const jurisdiction = resolveLeaseJurisdiction(ctx);
  const jLabel = jurisdictionLabel(jurisdiction);
  const supported = isLeaseGenerationSupported(jurisdiction);

  if (supported) {
    const built = tryBuildFullLeasePreview(ctx, source);
    if (built) {
      return {
        source,
        html: built.html,
        plainText: built.plainText,
        unsupportedJurisdiction: false,
        jurisdictionLabel: built.jurisdictionLabel,
      };
    }
  }

  if (source === "custom_comments") {
    const terms = activeCustomLeaseTerms(normalized);
    const plainText = terms
      ? `Additional Provisions from Property Manager\n\n${terms}\n\nThese provisions are merged into the Axis standard lease when a resident is placed.`
      : "Custom comments configured — open Edit to add lease clauses.";
    return {
      source,
      html: terms ? customCommentsPreviewHtml(terms) : null,
      plainText,
      unsupportedJurisdiction: !supported,
      jurisdictionLabel: supported ? jLabel : null,
    };
  }

  if (!supported) {
    const plainText =
      "Axis default lease applies at placement. Full preview is available for Seattle and San Francisco properties, or upload a custom PDF for other locations.";
    return {
      source,
      html: null,
      plainText,
      unsupportedJurisdiction: true,
      jurisdictionLabel: jLabel,
    };
  }

  return {
    source,
    html: null,
    plainText: "Axis default lease — preview unavailable for this property.",
    unsupportedJurisdiction: true,
    jurisdictionLabel: jLabel,
  };
}

export function stripLeaseHtmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateLeasePreviewText(text: string, maxLen = 480): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trim()}…`;
}

/** Listing fields that feed each preview section (for tests / docs). */
export function leasePreviewDataFieldMap(): Record<string, string[]> {
  return {
    "Parties & Premises": ["buildingName", "address", "zip", "neighborhood", "rooms[].name"],
    "Term & Rent": ["allowedLeaseTerms", "leaseTermsBody", "rooms[].monthlyRent", "entireHomeMonthlyRent"],
    "Security deposit": ["securityDeposit", "moveInFee", "applicationFee", "paymentAtSigningIncludes"],
    "Utilities & services": ["rooms[].utilitiesEstimate", "entireHomeUtilitiesEstimate", "serviceRequestOptions"],
    "House rules": ["houseRulesText"],
    "Shared spaces & amenities": ["sharedSpaces", "amenitiesText", "houseOverview"],
    "Pets & parking": ["petFriendly", "parkingMonthly", "serviceRequestOptions (pet registration)"],
    "Custom addendum": ["customLeaseTerms (when leaseConfigMode=custom)"],
  };
}
