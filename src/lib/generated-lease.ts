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
import {
  activeLeaseTemplateDoc,
  normalizeManagerListingSubmissionV1,
  type ManagerListingSubmissionV1,
} from "@/lib/manager-listing-submission";
import { leaseCss } from "@/lib/lease-templates/types";
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

/** Uploaded lease template for the application's property (Lease step of the create-listing wizard), or null. */
export function leaseTemplateDocForContext(ctx: LeaseGenerationContext): { url: string; name: string } | null {
  return activeLeaseTemplateDoc(ctx.submission);
}

/**
 * Lease document for properties whose manager uploaded their own lease template:
 * an Axis summary of the placement (parties, room, rent, dates) followed by the
 * manager's template document, which is the lease text itself.
 */
function buildManagerTemplateLeaseHtml(ctx: LeaseGenerationContext, doc: { url: string; name: string }): string {
  const a = ctx.application;
  const sub = ctx.submission ? normalizeManagerListingSubmissionV1(ctx.submission) : undefined;
  const prop = ctx.leasedRoom ?? ctx.listingProperty;
  const tenantName = dash(a.fullLegalName || "Resident");
  const generatedDate = escapeHtml(
    new Date(ctx.generatedAtIso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
  );
  const address = dash(prop?.address ?? sub?.address);
  const cityZip = dash([prop?.neighborhood ?? sub?.neighborhood, prop?.zip ?? sub?.zip].filter(Boolean).join(", "));
  const roomLabel = dash(prop?.unitLabel);
  const rent = rentSummaryFromApplication(a) ?? "As set forth in the lease document below";
  const leaseEnd = a.leaseTerm === "Month-to-Month" ? dash(a.leaseEnd || "N/A (month-to-month)") : dash(a.leaseEnd);
  const isPdf = /\.pdf(\?|$)/i.test(doc.url) || doc.url.startsWith("data:application/pdf") || /\.pdf$/i.test(doc.name);
  const docUrl = escapeHtml(doc.url);
  const docName = escapeHtml(doc.name);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Lease Agreement — ${tenantName}</title><style>${leaseCss()}
.doc-embed{width:100%;height:75vh;min-height:640px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc}
.doc-link{display:inline-block;margin:6px 0 14px;font-weight:600}</style></head><body>
<h1>LEASE AGREEMENT</h1>
<p class="sub">Prepared from the property manager's lease template · Generated ${generatedDate} via PropLane</p>

<h2>1. Placement Summary</h2>
<p>This summary is compiled by PropLane from the resident's application and the listing for convenience. The manager's lease document in Section 2 is the lease text.</p>
<table>
  <tr><th width="35%">Resident / Tenant</th><td><strong>${tenantName}</strong><br/>Phone: ${dash(a.phone)} &nbsp;·&nbsp; Email: ${dash(a.email)}</td></tr>
  <tr><th>Property</th><td>${address}${cityZip !== "—" ? `<br/>${cityZip}` : ""}</td></tr>
  <tr><th>Room / unit</th><td>${roomLabel}</td></tr>
  <tr><th>Lease term</th><td>${dash(a.leaseTerm)}</td></tr>
  <tr><th>Lease start</th><td>${dash(a.leaseStart)}</td></tr>
  <tr><th>Lease end</th><td>${leaseEnd}</td></tr>
  <tr><th>Monthly rent</th><td>${escapeHtml(rent)}</td></tr>
</table>

<h2>2. Lease Document (Manager Template)</h2>
<p>The property manager provided the following lease document for this property. If it does not display below, open it directly:</p>
<a class="doc-link" href="${docUrl}" target="_blank" rel="noopener">Open lease document — ${docName}</a>
${isPdf ? `<object class="doc-embed" data="${docUrl}" type="application/pdf"><p>The document preview could not be shown here. <a href="${docUrl}" target="_blank" rel="noopener">Open ${docName}</a>.</p></object>` : `<iframe class="doc-embed" src="${docUrl}" title="Lease document"></iframe>`}

<h2>3. Electronic Signature</h2>
<p><strong>Landlord / Authorized Agent</strong> and <strong>Resident / Tenant</strong> each execute this Agreement <strong>one time</strong> through the PropLane portal. The <strong>Electronic Signature Certificate</strong> appended to the signed copy is the binding record for both parties and applies to the manager's lease document above.</p>
</body></html>`;
}

/** Full HTML document suitable for download and "Print to PDF". */
export function buildAiGeneratedLeaseHtml(ctx: LeaseGenerationContext): string {
  const templateDoc = leaseTemplateDocForContext(ctx);
  if (templateDoc) return buildManagerTemplateLeaseHtml(ctx, templateDoc);
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
  a.download = `PropLane-AI-Lease-${safe}.html`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
