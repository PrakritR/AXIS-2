/**
 * AI-style generated residential room rental agreement (HTML).
 * Sections mirror a typical "room lease" / coliving PDF (e.g. *Lease Agreement — Room 1* style):
 * parties, premises & description, term, rent & late payment, security deposit & move-in
 * charges, utilities, use & occupancy, shared spaces & amenities, pets, maintenance & alterations,
 * landlord access, assignment/subletting, insurance, conduct, default & remedies, early termination,
 * notices, attorney fees, entire agreement, governing law, disclosures (lead paint etc.),
 * incorporation of application, rent schedule exhibit, and signature blocks.
 */

import type { MockProperty } from "@/data/types";
import { getPropertyById, parseRoomChoiceValue } from "@/lib/rental-application/data";
import { loadRentalWizardDraft } from "@/lib/rental-application/drafts";
import { resolvePlacementLeaseDates } from "@/lib/rental-application/lease-dates";
import { resolveApplicationPersonalFields } from "@/lib/application-personal-fields";
import { normalizeManagerListingSubmissionV1, type ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import { resolveLeaseJurisdiction } from "@/lib/lease-jurisdiction";
import { buildSanFranciscoLeaseHtml } from "@/lib/lease-templates/san-francisco";
import { buildSeattleLeaseHtml } from "@/lib/lease-templates/seattle";

type LeaseApplicationWithRentSnapshot = Partial<RentalWizardFormState> & {
  __signedRentLabel?: string;
};

const MONTH_TO_MONTH_RENT_SURCHARGE = 25;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dash(s: string | undefined | null): string {
  const t = (s ?? "").trim();
  return t ? escapeHtml(t) : "—";
}

/** First room choice that resolves to a listing, else the application listing. */
export function resolveLeasedRoomProperty(app: Partial<RentalWizardFormState>): MockProperty | undefined {
  for (const id of [app.roomChoice1, app.roomChoice2, app.roomChoice3]) {
    if (id) {
      const p = getPropertyById(id);
      if (p) return p;
    }
  }
  if (app.propertyId) return getPropertyById(app.propertyId);
  return undefined;
}

export function resolveApplicationListing(app: Partial<RentalWizardFormState>): MockProperty | undefined {
  if (!app.propertyId) return undefined;
  return getPropertyById(app.propertyId);
}

function submissionFor(prop: MockProperty | undefined): ManagerListingSubmissionV1 | undefined {
  return prop?.listingSubmission?.v === 1 ? prop.listingSubmission : undefined;
}

function sharedSpacesLeaseParagraph(raw: ManagerListingSubmissionV1 | undefined): string {
  if (!raw?.v) return "Common kitchen, bath, and living areas as shared among residents.";
  const sub = normalizeManagerListingSubmissionV1(raw);
  const entries = sub.sharedSpaces?.filter((s) => s.name.trim()) ?? [];
  if (!entries.length) return "Common kitchen, bath, and living areas as shared among residents.";
  return entries
    .map((s) => {
      const names = (s.roomAccessIds ?? [])
        .map((id) => sub.rooms.find((r) => r.id === id)?.name?.trim())
        .filter(Boolean)
        .join(", ");
      const head = names.length
        ? `${s.name.trim()} — access includes: ${names}.`
        : `${s.name.trim()}.`;
      const d = s.detail.trim();
      return d ? `${head} ${d}` : head;
    })
    .join(" ");
}

function findSubmissionRoomRent(sub: ManagerListingSubmissionV1 | undefined, unitLabel: string): string | undefined {
  if (!sub?.rooms?.length) return undefined;
  const u = unitLabel.trim().toLowerCase();
  const hit = sub.rooms.find((r) => {
    const rn = (r.name ?? "").trim().toLowerCase();
    if (!rn) return false;
    return rn.includes(u) || u.includes(rn);
  });
  if (hit && hit.monthlyRent > 0) return `$${hit.monthlyRent.toFixed(2)} / month`;
  return undefined;
}

function submissionRoomRentFromChoice(
  sub: ManagerListingSubmissionV1 | undefined,
  roomChoice1: string | undefined | null,
): string | undefined {
  if (!sub?.rooms?.length || !roomChoice1) return undefined;
  const { listingRoomId } = parseRoomChoiceValue(String(roomChoice1));
  if (!listingRoomId) return undefined;
  const normalized = normalizeManagerListingSubmissionV1(sub);
  const hit = normalized.rooms.find((r) => r.id === listingRoomId);
  if (!hit || hit.monthlyRent <= 0) return undefined;
  return `$${hit.monthlyRent.toFixed(2)} / month`;
}

export type LeaseGenerationContext = {
  application: Partial<RentalWizardFormState>;
  leasedRoom: MockProperty | undefined;
  listingProperty: MockProperty | undefined;
  submission: ManagerListingSubmissionV1 | undefined;
  generatedAtIso: string;
};

export function leaseContextFromApplication(application: Partial<RentalWizardFormState>): LeaseGenerationContext {
  const dates = resolvePlacementLeaseDates({
    leaseTerm: application.leaseTerm,
    leaseStart: application.leaseStart,
    leaseEnd: application.leaseEnd,
    rentalType: application.rentalType,
  });
  const normalizedApplication: Partial<RentalWizardFormState> = {
    ...application,
    ...resolveApplicationPersonalFields({
      name: application.fullLegalName ?? "",
      email: application.email ?? "",
      application: application as RentalWizardFormState,
    }),
    leaseTerm: dates.leaseTerm || application.leaseTerm,
    leaseStart: dates.leaseStart,
    leaseEnd: dates.leaseEnd,
  };
  const leasedRoom = resolveLeasedRoomProperty(normalizedApplication);
  const listingProperty = resolveApplicationListing(normalizedApplication) ?? leasedRoom;
  const submission = submissionFor(listingProperty) ?? submissionFor(leasedRoom);
  return {
    application: normalizedApplication,
    leasedRoom,
    listingProperty,
    submission,
    generatedAtIso: new Date().toISOString(),
  };
}

/** Rent line for lease tables — from application + listing when available. */
export function rentSummaryFromApplication(application: Partial<RentalWizardFormState> | undefined | null): string | null {
  if (!application || !Object.keys(application).length) return null;
  try {
    const signedRentLabel = (application as LeaseApplicationWithRentSnapshot).__signedRentLabel?.trim();
    if (signedRentLabel) return signedRentLabel;
    const ctx = leaseContextFromApplication(application as RentalWizardFormState);
    const room = ctx.leasedRoom;
    const list = ctx.listingProperty;
    const monthlyRent =
      submissionRoomRentFromChoice(ctx.submission, application.roomChoice1) ??
      (room && findSubmissionRoomRent(ctx.submission, room.unitLabel)) ??
      room?.rentLabel ??
      list?.rentLabel ??
      null;
    if (!monthlyRent) return null;
    const s = typeof monthlyRent === "string" ? monthlyRent : String(monthlyRent);
    if (s.includes("As set forth")) return null;
    return s;
  } catch {
    return null;
  }
}

export function gatherLeaseGenerationContext(): LeaseGenerationContext {
  const application = loadRentalWizardDraft() ?? {};
  return leaseContextFromApplication(application);
}

/** Full HTML document suitable for download and "Print to PDF". */
export function buildAiGeneratedLeaseHtml(ctx: LeaseGenerationContext): string {
  const jurisdiction = resolveLeaseJurisdiction(ctx);
  if (jurisdiction === "san_francisco") return buildSanFranciscoLeaseHtml(ctx);
  if (jurisdiction === "seattle") return buildSeattleLeaseHtml(ctx);
  throw new Error("Lease generation is only available for Seattle and San Francisco properties.");
}

export function downloadAiGeneratedLeaseHtml(ctx: LeaseGenerationContext): void {
  if (typeof window === "undefined") return;
  const html = buildAiGeneratedLeaseHtml(ctx);
  const rawName = (ctx.application.fullLegalName ?? "resident").trim() || "resident";
  const safe = rawName.replace(/[^\w\-]+/g, "_").slice(0, 60) || "resident";
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Axis-AI-Lease-${safe}.html`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
