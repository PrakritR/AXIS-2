/**
 * AI-style generated residential room rental agreement (HTML).
 * Sections mirror a typical “room lease” / coliving PDF (e.g. *Lease Agreement — Room 1* style):
 * parties, premises & description, term, rent & late payment, security deposit & move-in
 * charges, utilities, use & occupancy, shared spaces & amenities, pets, maintenance & alterations,
 * landlord access, assignment/subletting, insurance, conduct, default & remedies, early termination,
 * notices, attorney fees, entire agreement, governing law, disclosures (lead paint etc.),
 * incorporation of application, rent schedule exhibit, and signature blocks.
 */

import type { MockProperty } from "@/data/types";
import { getPropertyById } from "@/lib/rental-application/data";
import { loadRentalWizardDraft } from "@/lib/rental-application/drafts";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { paymentAtSigningPriceLabel } from "@/lib/rental-application/listing-fees-display";
import type { RentalWizardFormState } from "@/lib/rental-application/types";

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

function findSubmissionRoomRent(sub: ManagerListingSubmissionV1 | undefined, unitLabel: string): string | undefined {
  if (!sub) return undefined;
  const u = unitLabel.trim().toLowerCase();
  const hit = sub.rooms.find((r) => r.name.toLowerCase().includes(u) || u.includes(r.name.trim().toLowerCase()));
  if (hit && hit.monthlyRent > 0) return `$${hit.monthlyRent.toFixed(2)} / month`;
  return undefined;
}

export type LeaseGenerationContext = {
  application: Partial<RentalWizardFormState>;
  leasedRoom: MockProperty | undefined;
  listingProperty: MockProperty | undefined;
  submission: ManagerListingSubmissionV1 | undefined;
  generatedAtIso: string;
};

export function leaseContextFromApplication(application: Partial<RentalWizardFormState>): LeaseGenerationContext {
  const leasedRoom = resolveLeasedRoomProperty(application);
  const listingProperty = resolveApplicationListing(application) ?? leasedRoom;
  const submission = submissionFor(listingProperty) ?? submissionFor(leasedRoom);
  return {
    application,
    leasedRoom,
    listingProperty,
    submission,
    generatedAtIso: new Date().toISOString(),
  };
}

/** Rent line for lease tables — from application + listing when available. */
export function rentSummaryFromApplication(application: Partial<RentalWizardFormState> | undefined | null): string | null {
  if (!application || !Object.keys(application).length) return null;
  const ctx = leaseContextFromApplication(application as RentalWizardFormState);
  const room = ctx.leasedRoom;
  const list = ctx.listingProperty;
  const monthlyRent =
    (room && findSubmissionRoomRent(ctx.submission, room.unitLabel)) ??
    room?.rentLabel ??
    list?.rentLabel ??
    null;
  if (!monthlyRent) return null;
  const s = typeof monthlyRent === "string" ? monthlyRent : String(monthlyRent);
  if (s.includes("As set forth")) return null;
  return s;
}

export function gatherLeaseGenerationContext(): LeaseGenerationContext {
  const application = loadRentalWizardDraft() ?? {};
  return leaseContextFromApplication(application);
}

function leaseCss(): string {
  return `
    * { box-sizing: border-box; }
    body { font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif; color: #111; line-height: 1.45; max-width: 800px; margin: 0 auto; padding: 24px 20px 48px; font-size: 11pt; }
    h1 { font-size: 1.35rem; text-align: center; margin: 0 0 0.25rem; font-weight: 700; }
    .sub { text-align: center; font-size: 0.85rem; color: #444; margin-bottom: 1.5rem; }
    h2 { font-size: 1.05rem; margin: 1.35rem 0 0.5rem; border-bottom: 1px solid #ccc; padding-bottom: 0.2rem; }
    p { margin: 0.4rem 0; }
    ol, ul { margin: 0.35rem 0 0.5rem 1.25rem; }
    li { margin: 0.2rem 0; }
    table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.95rem; }
    th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .sig { margin-top: 2.5rem; display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
    .sig-block { border-top: 1px solid #000; padding-top: 0.35rem; font-size: 0.9rem; }
    @media print { body { padding: 0; } }
  `;
}

/** Full HTML document suitable for download and “Print to PDF”. */
export function buildAiGeneratedLeaseHtml(ctx: LeaseGenerationContext): string {
  const { application: a, leasedRoom: room, listingProperty: list, submission: sub, generatedAtIso } = ctx;

  const premises =
    room?.title ??
    [room?.buildingName, room?.unitLabel].filter(Boolean).join(" · ") ??
    list?.title ??
    "the premises described in this Agreement";

  const address = room?.address ?? list?.address ?? "";
  const cityZip = [room?.neighborhood ?? list?.neighborhood, room?.zip ?? list?.zip].filter(Boolean).join(", ");

  const monthlyRent =
    (room && findSubmissionRoomRent(sub, room.unitLabel)) ??
    room?.rentLabel ??
    list?.rentLabel ??
    "As set forth in the rent schedule below";

  const leaseTerm = dash(a.leaseTerm);
  const leaseStart = dash(a.leaseStart);
  const leaseEnd = a.leaseTerm === "Month-to-Month" ? dash(a.leaseEnd || "N/A (month-to-month)") : dash(a.leaseEnd);

  const appFee = sub?.applicationFee ?? "—";
  const secDep = sub?.securityDeposit ?? "—";
  const moveInFee = sub?.moveInFee ?? "—";
  const paySigning = sub ? paymentAtSigningPriceLabel(sub) : "—";
  const utilities = sub?.utilitiesMonthly ?? "—";
  const applicantUtilities = (a.expectedUtilitiesMonthly ?? "").trim();
  const leaseTermsBody = sub?.leaseTermsBody?.trim() || "Standard lease lengths and renewal as posted on the listing.";
  const houseOverview = sub?.houseOverview?.trim() || list?.tagline || "Shared housing as described on the listing.";
  const sharedSpaces = sub?.sharedSpacesDescription?.trim() || "Common kitchen, bath, and living areas as shared among residents.";
  const amenities = sub?.amenitiesText?.trim() || "See listing amenities.";
  const costsDetail = sub?.houseCostsDetail?.trim() || "Recurring housing costs as summarized on the listing.";
  const petPolicy = (room?.petFriendly ?? list?.petFriendly)
    ? "Pets may be permitted subject to written approval, additional deposit, and house rules."
    : "No pets without prior written consent of Landlord.";

  const tenantRaw = (a.fullLegalName ?? "").trim() || "Resident";
  const tenantName = escapeHtml(tenantRaw);
  const tenantPhone = dash(a.phone);
  const tenantEmail = dash(a.email);
  const tenantDob = dash(a.dateOfBirth);
  const employer = dash(a.employer);
  const jobTitle = dash(a.jobTitle);
  const monthlyIncome = dash(a.monthlyIncome);
  const occupancy = dash(a.occupancyCount);
  const pets = dash(a.pets);
  const zelleLine =
    sub?.zellePaymentsEnabled && sub.zelleContact?.trim()
      ? `Zelle and similar electronic payments may be directed to: ${escapeHtml(sub.zelleContact.trim())}.`
      : "Rent shall be paid by method agreed in writing with Landlord or manager portal.";

  const landlordLine = escapeHtml(list?.buildingName ?? room?.buildingName ?? "Landlord (see listing manager)");

  const body = `
<h1>RESIDENTIAL ROOM RENTAL AGREEMENT</h1>
<p class="sub"><strong>AI-generated draft</strong> — assembled from your rental application and listing details. Not legal advice. Have counsel review before signing.</p>
<p><strong>Generated:</strong> ${escapeHtml(new Date(generatedAtIso).toLocaleString())}</p>

<h2>1. Parties</h2>
<p>This Agreement is entered between <strong>${landlordLine}</strong> (“<strong>Landlord</strong>”) and <strong>${tenantName}</strong> (“<strong>Resident</strong>” or “<strong>Tenant</strong>”). Contact: ${tenantPhone}, ${tenantEmail}.</p>

<h2>2. Premises</h2>
<p>Landlord leases to Resident the following furnished room and appurtenant rights to shared common areas: <strong>${escapeHtml(premises)}</strong>, located at approximately <strong>${escapeHtml(address)}</strong>${cityZip ? ` (${escapeHtml(cityZip)})` : ""} (“<strong>Premises</strong>”).</p>
<p><strong>Building / coliving overview:</strong> ${escapeHtml(houseOverview)}</p>

<h2>3. Term</h2>
<p>The initial term shall be <strong>${leaseTerm}</strong>, beginning on <strong>${leaseStart}</strong> and ending on <strong>${leaseEnd}</strong>, unless sooner terminated in accordance with this Agreement. ${escapeHtml(leaseTermsBody)}</p>

<h2>4. Rent</h2>
<p>Monthly rent is <strong>${escapeHtml(typeof monthlyRent === "string" ? monthlyRent : String(monthlyRent))}</strong>, due on the 1st calendar day of each month (or as otherwise posted). ${zelleLine}</p>
<p>Late payment may incur a reasonable late fee and administrative charges as permitted by applicable law and as stated in house policies.</p>

<h2>5. Security deposit & move-in charges</h2>
<p>Application fee (if applicable): <strong>${escapeHtml(appFee)}</strong>. Security deposit: <strong>${escapeHtml(secDep)}</strong>. Move-in fee: <strong>${escapeHtml(moveInFee)}</strong>. Amount due at or before signing / move-in: <strong>${escapeHtml(paySigning)}</strong>. These amounts reflect the listing and application you selected.</p>

<h2>6. Utilities & services</h2>
<p>Listing estimate for utilities / RUBS / house services: <strong>${escapeHtml(utilities)}</strong>. ${escapeHtml(costsDetail)}${
    applicantUtilities
      ? ` <strong>Resident stated expected monthly utilities (application):</strong> ${escapeHtml(applicantUtilities)}.`
      : ""
  }</p>

<h2>7. Use and occupancy</h2>
<p>The Premises shall be used only as a private residence for <strong>${occupancy}</strong> named occupant(s). No unlawful use. Resident shall comply with all applicable laws, HOA rules if any, and posted house rules.</p>

<h2>8. Shared spaces & amenities</h2>
<p>${escapeHtml(sharedSpaces)}</p>
<p><strong>Amenities (summary):</strong> ${escapeHtml(amenities)}</p>

<h2>9. Pets</h2>
<p>${escapeHtml(petPolicy)} Current pet disclosure on application: <strong>${pets}</strong>.</p>

<h2>10. Maintenance, repairs, and alterations</h2>
<p>Resident shall keep the Premises clean and sanitary and promptly report leaks, pests, or safety issues. Resident shall not make material alterations or paint without prior written consent. Landlord may perform repairs with reasonable notice except in emergencies.</p>

<h2>11. Landlord access</h2>
<p>Landlord and authorized agents may enter to inspect, repair, show the unit to prospective residents upon reasonable notice, or in emergency. Coliving operators may use posted notice policies consistent with law.</p>

<h2>12. Assignment & subletting</h2>
<p>No assignment, sublease, short-term rental, or transfer of occupancy without prior written consent of Landlord. Unauthorized guests beyond posted guest policy may constitute default.</p>

<h2>13. Renter’s insurance</h2>
<p>Resident is encouraged to maintain liability insurance and contents coverage naming Landlord as interested party if required by Landlord. Failure to maintain required insurance may be a material breach where specified in addenda.</p>

<h2>14. Quiet enjoyment & conduct</h2>
<p>Resident shall not disturb others’ quiet enjoyment. Noise, common-area use, kitchen hygiene, and shared resource use shall follow reasonable house standards posted by Landlord.</p>

<h2>15. Default & remedies</h2>
<p>Material breach—including nonpayment, unlawful use, unauthorized occupants, or serious lease violations—may result in notices to cure, monetary damages, and termination procedures available under applicable landlord-tenant law after any required notice period.</p>

<h2>16. Early termination</h2>
<p>Early termination, buyout, reletting fees, and notice to vacate shall follow the lease term selection and any posted coliving policy, subject to applicable law.</p>

<h2>17. Notices</h2>
<p>Notices may be sent to Resident at the email and phone on file and to Landlord at listing manager contact or portal messaging. Address for legal notices may be updated in writing.</p>

<h2>18. Attorney fees & costs</h2>
<p>If any party brings an action to enforce this Agreement, the prevailing party may recover reasonable attorney fees and costs to the extent permitted by law.</p>

<h2>19. Entire agreement; severability; amendments</h2>
<p>This document, listing disclosures, and signed addenda constitute the entire agreement. If any provision is invalid, the remainder survives. Amendments must be in writing and signed.</p>

<h2>20. Governing law</h2>
<p>This Agreement shall be governed by the laws of the State of Washington (replace with the governing jurisdiction for your property).</p>

<h2>21. Disclosures</h2>
<p>For housing built before 1978, federal lead-based paint disclosure may be required. Mold, smoke-free, and local rental disclosures may apply. Resident acknowledges reading listing materials and any provided pamphlets.</p>

<h2>22. Incorporation of application summary</h2>
<p>The rental application you submitted is incorporated by reference as to identity, household size, pet disclosure, and financial summary (non-binding excerpt below).</p>
<table>
  <tr><th>Field</th><th>Information supplied</th></tr>
  <tr><td>Legal name</td><td>${tenantName}</td></tr>
  <tr><td>Date of birth</td><td>${tenantDob}</td></tr>
  <tr><td>Employer</td><td>${employer}</td></tr>
  <tr><td>Title</td><td>${jobTitle}</td></tr>
  <tr><td>Monthly income (stated)</td><td>${monthlyIncome}</td></tr>
  <tr><td>Prior address (current street)</td><td>${dash(a.currentStreet)} ${dash(a.currentCity)}, ${dash(a.currentState)} ${dash(a.currentZip)}</td></tr>
  <tr><td>References (names)</td><td>${dash(a.ref1Name)}; ${dash(a.ref2Name)}</td></tr>
  <tr><td>Additional notes</td><td>${dash(a.additionalNotes)}</td></tr>
</table>

<h2>23. Exhibits</h2>
<p><strong>Exhibit A — Rent & fees schedule (from listing / application)</strong></p>
<table>
  <tr><th>Item</th><th>Amount</th></tr>
  <tr><td>Monthly rent</td><td>${escapeHtml(typeof monthlyRent === "string" ? monthlyRent : String(monthlyRent))}</td></tr>
  <tr><td>Application fee</td><td>${escapeHtml(appFee)}</td></tr>
  <tr><td>Security deposit</td><td>${escapeHtml(secDep)}</td></tr>
  <tr><td>Move-in fee</td><td>${escapeHtml(moveInFee)}</td></tr>
  <tr><td>Due at signing</td><td>${escapeHtml(paySigning)}</td></tr>
</table>

<h2>24. Signatures</h2>
<p>IN WITNESS WHEREOF, the parties execute this Agreement as of the date last written below.</p>
<div class="sig">
  <div class="sig-block">Landlord / Authorized agent<br/><br/>Name: ___________________________<br/>Date: ___________________________</div>
  <div class="sig-block">Resident<br/><br/>Name: ${tenantName}<br/>Date: ___________________________</div>
</div>
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Residential Room Rental Agreement — ${escapeHtml(tenantRaw)}</title>
  <style>${leaseCss()}</style>
</head>
<body>
${body}
</body>
</html>`;
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
