import type { DemoApplicantRow } from "@/data/demo-portal";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import {
  displayableCustomFieldAnswers,
  formatCustomFieldAnswerDisplay,
} from "@/lib/rental-application/custom-fields";
import { formatLeaseDateLabel } from "@/lib/rental-application/lease-dates";
import { leaseCss } from "@/lib/lease-templates/types";

type Field = { label: string; value: string };

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value: string | number | undefined | null): string {
  const raw = clean(value);
  if (!raw) return "";
  if (raw.startsWith("$")) return raw;
  const n = Number.parseFloat(raw.replace(/[^0-9.]+/g, ""));
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : raw;
}

function yesNo(value: string | null | undefined): string {
  const v = clean(value).toLowerCase();
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  return "";
}

function statusLabel(row: DemoApplicantRow): string {
  if (row.bucket === "approved") return "Approved";
  if (row.bucket === "rejected") return "Rejected";
  return "Pending review";
}

/** `<h2>` + label/value table for the populated fields; empty string when nothing is populated. */
function section(title: string, fields: Field[]): string {
  const populated = fields.filter((f) => f.value.trim());
  if (populated.length === 0) return "";
  const rows = populated
    .map((f) => `<tr><th width="35%">${escapeHtml(f.label)}</th><td>${escapeHtml(f.value)}</td></tr>`)
    .join("\n  ");
  return `
<h2>${escapeHtml(title)}</h2>
<table>
  ${rows}
</table>`;
}

function freeTextSection(title: string, body: string): string {
  const text = body.trim();
  if (!text) return "";
  return `
<h2>${escapeHtml(title)}</h2>
<p>${escapeHtml(text)}</p>`;
}

export type ApplicationHtmlOptions = {
  /** Human room label resolved on the client (listing catalog is not available server-side). */
  roomLabel?: string;
  /** ISO generation timestamp; defaults to now. */
  generatedAt?: string;
};

/**
 * Clean rendered-document view of a rental application, matching the lease
 * document presentation (white page, serif, section tables). Mirrors the
 * content of buildApplicationPdf; meant for an `srcDoc` iframe so managers can
 * read the application without the browser's PDF-viewer chrome.
 */
export function buildApplicationHtml(row: DemoApplicantRow, options: ApplicationHtmlOptions = {}): string {
  const app: Partial<RentalWizardFormState> = row.application ?? {};
  const applicantName = clean(app.fullLegalName) || clean(row.name) || "Applicant";
  const axisId = clean(row.id) || "—";
  const generated = options.generatedAt ? new Date(options.generatedAt) : new Date();
  const generatedLabel = generated.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const roomLabel = clean(options.roomLabel);

  const signedRent =
    row.signedMonthlyRent && row.signedMonthlyRent > 0
      ? `$${row.signedMonthlyRent.toFixed(2)} / month`
      : money(app.managerRentOverride);

  const currentAddress = [
    clean(app.currentStreet),
    [clean(app.currentCity), clean(app.currentState)].filter(Boolean).join(", "),
    clean(app.currentZip),
  ]
    .filter(Boolean)
    .join("  ");
  const prevAddress = [
    clean(app.prevStreet),
    [clean(app.prevCity), clean(app.prevState)].filter(Boolean).join(", "),
    clean(app.prevZip),
  ]
    .filter(Boolean)
    .join("  ");

  const body = `
<h1>AXIS RENTAL APPLICATION</h1>
<p class="sub">Axis Property Management · Official application record</p>
<p class="generated">Axis ID ${escapeHtml(axisId)} · ${escapeHtml(statusLabel(row))} · Generated ${escapeHtml(generatedLabel)}</p>

${section("Application summary", [
  { label: "Applicant", value: applicantName },
  { label: "Property", value: clean(row.property) || "—" },
  { label: "Room", value: roomLabel || clean(app.roomChoice1) || "—" },
  { label: "Move-in date", value: formatLeaseDateLabel(app.leaseStart) || clean(app.leaseStart) || "—" },
  { label: "Signed monthly rent", value: signedRent || "—" },
])}

${section("Applicant details", [
  { label: "Full legal name", value: applicantName },
  { label: "Email", value: clean(app.email) || clean(row.email) },
  { label: "Phone", value: clean(app.phone) },
  { label: "Date of birth", value: clean(app.dateOfBirth) },
  { label: "Driver's license", value: clean(app.driversLicense) },
  { label: "Application status", value: statusLabel(row) },
  { label: "Stage", value: clean(row.stage) },
])}

${section("Property & room", [
  { label: "Property", value: clean(row.property) },
  { label: "Room", value: roomLabel || clean(app.roomChoice1) },
  { label: "Second choice", value: roomLabel ? "" : clean(app.roomChoice2) },
  { label: "Third choice", value: roomLabel ? "" : clean(app.roomChoice3) },
  {
    label: "Rental type",
    value: app.rentalType === "short_term" ? "Short-term stay" : app.rentalType ? "Standard lease" : "",
  },
  { label: "Stay type / term", value: clean(app.leaseTerm) },
  { label: "Move-in date", value: formatLeaseDateLabel(app.leaseStart) || clean(app.leaseStart) },
  { label: "Lease end / move-out", value: formatLeaseDateLabel(app.leaseEnd) || clean(app.leaseEnd) },
  { label: "Signed monthly rent", value: signedRent },
  { label: "Utilities", value: money(app.managerUtilitiesOverride) },
  { label: "Security deposit", value: money(app.managerSecurityDepositOverride) },
  { label: "Move-in cost", value: money(app.managerMoveInFeeOverride) },
  { label: clean(app.managerOtherCostLabel) || "Other cost", value: money(app.managerOtherCostAmount) },
])}

${section("Household", [
  { label: "Applying as a group", value: yesNo(app.applyingAsGroup) },
  { label: "Group size", value: clean(app.groupSize) },
  { label: "Has co-signer", value: yesNo(app.hasCosigner) },
  { label: "Occupants", value: clean(app.occupancyCount) },
  { label: "Pets", value: clean(app.pets) },
])}

${section("Current residence", [
  { label: "Address", value: currentAddress },
  { label: "Landlord", value: clean(app.currentLandlordName) },
  { label: "Landlord phone", value: clean(app.currentLandlordPhone) },
  { label: "Move in", value: clean(app.currentMoveIn) },
  { label: "Move out", value: clean(app.currentMoveOut) },
  { label: "Reason for leaving", value: clean(app.currentReasonLeaving) },
])}

${
  app.noPreviousAddress
    ? ""
    : section("Previous residence", [
        { label: "Address", value: prevAddress },
        { label: "Landlord", value: clean(app.prevLandlordName) },
        { label: "Landlord phone", value: clean(app.prevLandlordPhone) },
        { label: "Move in", value: clean(app.prevMoveIn) },
        { label: "Move out", value: clean(app.prevMoveOut) },
        { label: "Reason for leaving", value: clean(app.prevReasonLeaving) },
      ])
}

${section("Employment & income", [
  { label: "Employment", value: app.notEmployed ? "Not currently employed" : "" },
  { label: "Employer", value: clean(app.employer) },
  { label: "Employer address", value: clean(app.employerAddress) },
  { label: "Job title", value: clean(app.jobTitle) },
  { label: "Supervisor", value: clean(app.supervisorName) },
  { label: "Supervisor phone", value: clean(app.supervisorPhone) },
  { label: "Employment start", value: clean(app.employmentStart) },
  { label: "Monthly income", value: money(app.monthlyIncome) },
  { label: "Annual income", value: money(app.annualIncome) },
  { label: "Other income", value: clean(app.otherIncome) },
])}

${section("References", [
  {
    label: "Reference 1",
    value: [clean(app.ref1Name), clean(app.ref1Relationship), clean(app.ref1Phone)].filter(Boolean).join(" · "),
  },
  {
    label: "Reference 2",
    value: [clean(app.ref2Name), clean(app.ref2Relationship), clean(app.ref2Phone)].filter(Boolean).join(" · "),
  },
])}

${section(
  "Manager questions",
  displayableCustomFieldAnswers(app.customFieldAnswers).map((answer) => ({
    label: answer.label,
    value: formatCustomFieldAnswerDisplay(answer),
  })),
)}

${section("Disclosures", [
  { label: "Prior eviction", value: yesNo(app.evictionHistory) },
  { label: "Eviction details", value: clean(app.evictionDetails) },
  { label: "Bankruptcy", value: yesNo(app.bankruptcyHistory) },
  { label: "Bankruptcy details", value: clean(app.bankruptcyDetails) },
  { label: "Criminal history", value: yesNo(app.criminalHistory) },
  { label: "Criminal details", value: clean(app.criminalDetails) },
])}

${section("Consent & signature", [
  { label: "Credit/background consent", value: app.consentCredit ? "Authorized" : "" },
  { label: "Attestation of truth", value: app.consentTruth ? "Acknowledged" : "" },
  { label: "Application fee acknowledged", value: app.applicationFeeAcknowledged ? "Yes" : "" },
  { label: "Digital signature", value: clean(app.digitalSignature) },
  { label: "Date signed", value: clean(app.dateSigned) },
])}

${freeTextSection("Manager notes", clean(row.detail))}

<p class="footnote">Generated from Axis application records. Amounts and placement can change later in the lease or payment portal. Axis Property Management · Confidential</p>
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rental Application — ${escapeHtml(applicantName)}</title>
  <style>${leaseCss()}
    html, body { background: #fff; }
    .footnote { margin-top: 2.4rem; border-top: 1px solid #ccc; padding-top: 0.8rem; font-size: 0.8rem; font-style: italic; color: #777; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}
