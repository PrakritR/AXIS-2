import { LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { normalizeManagerListingSubmissionV1, PAYMENT_AT_SIGNING_OPTIONS } from "@/lib/manager-listing-submission";
import { parseMoneyAmount } from "@/lib/parse-money";

export type ListingSigningComputationInput = ManagerListingSubmissionV1 | undefined;

/** Monthly rent range from all rooms with rent set (listing summary). */
export function monthlyRentListingLabel(sub: ListingSigningComputationInput): string {
  if (!sub?.v) return "—";
  const n = normalizeManagerListingSubmissionV1(sub);
  const rents = n.rooms.filter((r) => r.name.trim()).map((r) => r.monthlyRent).filter((x) => x > 0);
  if (!rents.length) return "—";
  const lo = Math.min(...rents);
  const hi = Math.max(...rents);
  return lo === hi ? `$${lo.toFixed(2)}/mo` : `$${lo.toFixed(2)}–${hi.toFixed(2)}/mo`;
}

/**
 * Monthly rent for the applicant’s first-choice room when the choice includes a room id; otherwise the listing range.
 */
export function applicantFirstChoiceRentLabel(sub: ListingSigningComputationInput, roomChoice1: string): string {
  if (!sub?.v) return "—";
  const n = normalizeManagerListingSubmissionV1(sub);
  const v = roomChoice1.trim();
  const sep = LISTING_ROOM_CHOICE_SEP;
  if (v.includes(sep)) {
    const roomId = v.slice(v.indexOf(sep) + sep.length);
    const room = n.rooms.find((r) => r.id === roomId);
    if (room && room.monthlyRent > 0) return `$${room.monthlyRent.toFixed(2)}/mo`;
  }
  return monthlyRentListingLabel(sub);
}

/** Human-readable list of charges included in “payment due at signing” (from listing settings). */
export function paymentAtSigningIncludedLabels(sub: ListingSigningComputationInput): string {
  if (!sub?.v) return "";
  const n = normalizeManagerListingSubmissionV1(sub);
  const inc = new Set(n.paymentAtSigningIncludes ?? []);
  const labels = PAYMENT_AT_SIGNING_OPTIONS.filter((o) => inc.has(o.id)).map((o) => o.label.toLowerCase());
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]!} and ${labels[1]!}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]!}`;
}

/** Normalize fee lines for display (add $ when the listing stored a bare number). */
export function formatListingFeeDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return "—";
  if (/^\$/.test(t)) return t;
  const n = parseMoneyAmount(t);
  if (n > 0) return `$${n.toFixed(2)}`;
  return t;
}

/** Price label for “Payment due at signing” from selected charge types. */
export function paymentAtSigningPriceLabel(sub: ListingSigningComputationInput): string {
  if (!sub?.v) return "—";
  const n = normalizeManagerListingSubmissionV1(sub);
  const includes = n.paymentAtSigningIncludes ?? [];
  if (!includes.length) return "—";

  let sum = 0;
  if (includes.includes("security_deposit")) sum += parseMoneyAmount(n.securityDeposit);
  if (includes.includes("move_in_fee")) sum += parseMoneyAmount(n.moveInFee);
  if (includes.includes("first_month_rent")) {
    const rents = n.rooms.map((r) => r.monthlyRent).filter((x) => x > 0);
    if (rents.length) sum += Math.min(...rents);
  }
  if (includes.includes("first_month_utilities")) {
    const u = n.rooms.map((r) => parseMoneyAmount(r.utilitiesEstimate ?? "")).filter((x) => x > 0);
    if (u.length) sum += Math.min(...u);
  }

  if (sum <= 0) return includes.length ? "Amount TBD — confirm with manager" : "—";
  return `$${sum.toFixed(2)}`;
}

/** Detail copy for listing / lease when explaining signing charges. */
export function paymentAtSigningDetailBody(sub: ListingSigningComputationInput): string {
  if (!sub?.v) return "Confirm amounts and timing with the property manager.";
  const n = normalizeManagerListingSubmissionV1(sub);
  const includes = n.paymentAtSigningIncludes ?? [];
  if (!includes.length) return "Confirm payment due at signing with the property manager.";

  const parts: string[] = [];
  if (includes.includes("security_deposit")) {
    parts.push(`Security deposit (${n.securityDeposit.trim() || "—"}).`);
  }
  if (includes.includes("move_in_fee")) {
    parts.push(`Move-in fee (${n.moveInFee.trim() || "—"}).`);
  }
  if (includes.includes("first_month_rent")) {
    const rents = n.rooms.map((r) => r.monthlyRent).filter((x) => x > 0);
    parts.push(
      rents.length
        ? `First month rent (from $${Math.min(...rents).toFixed(2)} / month depending on room).`
        : "First month rent (set room rent amounts on the listing).",
    );
  }
  if (includes.includes("first_month_utilities")) {
    const u = n.rooms.map((r) => parseMoneyAmount(r.utilitiesEstimate ?? "")).filter((x) => x > 0);
    parts.push(
      u.length
        ? `First month utilities (estimate from $${Math.min(...u).toFixed(2)} / month by room).`
        : "First month utilities (enter an estimate per room under Rooms).",
    );
  }
  return parts.join(" ");
}

/** Single-line utilities summary for listing cards (per-room estimates). */
export function utilitiesListingEstimateLabel(sub: ManagerListingSubmissionV1 | undefined): string {
  if (!sub?.v) return "—";
  const n = normalizeManagerListingSubmissionV1(sub);
  const vals = n.rooms
    .filter((r) => r.name.trim())
    .map((r) => parseMoneyAmount(r.utilitiesEstimate ?? ""))
    .filter((x) => x > 0);
  if (!vals.length) return "—";
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return lo === hi ? `$${lo.toFixed(2)}/mo est.` : `$${lo.toFixed(2)}–${hi.toFixed(2)}/mo est.`;
}

/** Multi-line detail: each room’s utilities estimate. */
export function utilitiesListingEstimateDetail(sub: ManagerListingSubmissionV1 | undefined): string {
  if (!sub?.v) return "Utilities TBD.";
  const n = normalizeManagerListingSubmissionV1(sub);
  const lines = n.rooms
    .filter((r) => r.name.trim())
    .map((r) => `${r.name.trim()}: ${r.utilitiesEstimate?.trim() || "—"}`);
  return lines.length ? lines.join("\n") : "Utilities TBD.";
}
