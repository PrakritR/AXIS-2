import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { DemoApplicantRow } from "@/data/demo-portal";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import { formatLeaseDateLabel } from "@/lib/rental-application/lease-dates";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const FOOTER_Y = 42;
const LABEL_X = MARGIN;
const VALUE_X = MARGIN + 168;
const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.4, 0.45, 0.52);
const RULE = rgb(0.86, 0.89, 0.93);

type Field = { label: string; value: string };

function clean(value: unknown): string {
  const s = String(value ?? "").trim();
  return s;
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

/** Split text so it fits maxWidth at the given font size (word wrap, char-break as fallback). */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const widthOf = (s: string) => font.widthOfTextAtSize(s, size);
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (widthOf(word) <= maxWidth) {
      line = word;
    } else {
      // Break a very long token character by character.
      let chunk = "";
      for (const ch of word) {
        if (widthOf(chunk + ch) <= maxWidth) {
          chunk += ch;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      line = chunk;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export type ApplicationPdfOptions = {
  /** Human room label resolved on the client (listing catalog is not available server-side). */
  roomLabel?: string;
  /** ISO generation timestamp; defaults to now. */
  generatedAt?: string;
};

export async function buildApplicationPdf(
  row: DemoApplicantRow,
  options: ApplicationPdfOptions = {},
): Promise<Uint8Array> {
  const app: Partial<RentalWizardFormState> = row.application ?? {};
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const valueWidth = PAGE_WIDTH - MARGIN - VALUE_X;

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };
  const ensure = (needed: number) => {
    if (y - needed < FOOTER_Y + 24) newPage();
  };

  const drawField = ({ label, value }: Field) => {
    const lines = wrapText(value, regular, 10, valueWidth);
    ensure(Math.max(16, lines.length * 13));
    page.drawText(label, { x: LABEL_X, y: y - 9, size: 9, font: bold, color: MUTED });
    lines.forEach((line, i) => {
      page.drawText(line, { x: VALUE_X, y: y - 9 - i * 13, size: 10, font: regular, color: INK });
    });
    y -= Math.max(16, lines.length * 13 + 3);
  };

  const drawSection = (title: string, fields: Field[]) => {
    const populated = fields.filter((f) => f.value.trim());
    if (populated.length === 0) return;
    ensure(40);
    y -= 10;
    page.drawText(title.toUpperCase(), { x: MARGIN, y: y - 10, size: 10.5, font: bold, color: INK });
    y -= 16;
    page.drawLine({
      start: { x: MARGIN, y: y - 2 },
      end: { x: MARGIN + contentWidth, y: y - 2 },
      thickness: 0.75,
      color: RULE,
    });
    y -= 10;
    for (const field of populated) drawField(field);
  };

  const drawFreeText = (title: string, body: string) => {
    const text = body.trim();
    if (!text) return;
    ensure(40);
    y -= 10;
    page.drawText(title.toUpperCase(), { x: MARGIN, y: y - 10, size: 10.5, font: bold, color: INK });
    y -= 16;
    page.drawLine({
      start: { x: MARGIN, y: y - 2 },
      end: { x: MARGIN + contentWidth, y: y - 2 },
      thickness: 0.75,
      color: RULE,
    });
    y -= 12;
    for (const line of wrapText(text, regular, 10, contentWidth)) {
      ensure(14);
      page.drawText(line, { x: MARGIN, y: y - 9, size: 10, font: regular, color: INK });
      y -= 13;
    }
  };

  // ---- Header -------------------------------------------------------------
  page.drawText("AXIS PROPERTY MANAGEMENT", { x: MARGIN, y: y - 9, size: 9, font: bold, color: MUTED });
  y -= 22;
  page.drawText("Rental Application", { x: MARGIN, y: y - 16, size: 20, font: bold, color: INK });
  y -= 26;
  const applicantName = clean(app.fullLegalName) || clean(row.name) || "Applicant";
  page.drawText(applicantName, { x: MARGIN, y: y - 12, size: 12, font: regular, color: INK });
  y -= 18;
  const generated = options.generatedAt ? new Date(options.generatedAt) : new Date();
  page.drawText(
    `Axis ID ${clean(row.id) || "—"}   ·   ${statusLabel(row)}   ·   Generated ${generated.toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    })}`,
    { x: MARGIN, y: y - 9, size: 9, font: regular, color: MUTED },
  );
  y -= 14;

  const roomLabel = clean(options.roomLabel);

  // ---- Applicant ----------------------------------------------------------
  drawSection("Applicant", [
    { label: "Full legal name", value: applicantName },
    { label: "Email", value: clean(app.email) || clean(row.email) },
    { label: "Phone", value: clean(app.phone) },
    { label: "Date of birth", value: clean(app.dateOfBirth) },
    { label: "Driver's license", value: clean(app.driversLicense) },
    { label: "Application status", value: statusLabel(row) },
    { label: "Stage", value: clean(row.stage) },
  ]);

  // ---- Property / placement ----------------------------------------------
  drawSection("Property applied for", [
    { label: "Property", value: clean(row.property) },
    { label: "Room", value: roomLabel || clean(app.roomChoice1) },
    { label: "Second choice", value: roomLabel ? "" : clean(app.roomChoice2) },
    { label: "Third choice", value: roomLabel ? "" : clean(app.roomChoice3) },
    { label: "Rental type", value: app.rentalType === "short_term" ? "Short-term stay" : app.rentalType ? "Standard lease" : "" },
    { label: "Stay type / term", value: clean(app.leaseTerm) },
    { label: "Move-in date", value: formatLeaseDateLabel(app.leaseStart) || clean(app.leaseStart) },
    { label: "Lease end / move-out", value: formatLeaseDateLabel(app.leaseEnd) || clean(app.leaseEnd) },
    {
      label: "Signed monthly rent",
      value:
        row.signedMonthlyRent && row.signedMonthlyRent > 0
          ? `$${row.signedMonthlyRent.toFixed(2)} / month`
          : money(app.managerRentOverride),
    },
    { label: "Utilities", value: money(app.managerUtilitiesOverride) },
    { label: "Security deposit", value: money(app.managerSecurityDepositOverride) },
    { label: "Move-in cost", value: money(app.managerMoveInFeeOverride) },
    {
      label: clean(app.managerOtherCostLabel) || "Other cost",
      value: money(app.managerOtherCostAmount),
    },
  ]);

  // ---- Occupancy / household ---------------------------------------------
  drawSection("Household", [
    { label: "Applying as a group", value: yesNo(app.applyingAsGroup) },
    { label: "Group size", value: clean(app.groupSize) },
    { label: "Has co-signer", value: yesNo(app.hasCosigner) },
    { label: "Occupants", value: clean(app.occupancyCount) },
    { label: "Pets", value: clean(app.pets) },
  ]);

  // ---- Current residence --------------------------------------------------
  const currentAddress = [
    clean(app.currentStreet),
    [clean(app.currentCity), clean(app.currentState)].filter(Boolean).join(", "),
    clean(app.currentZip),
  ]
    .filter(Boolean)
    .join("  ");
  drawSection("Current residence", [
    { label: "Address", value: currentAddress },
    { label: "Landlord", value: clean(app.currentLandlordName) },
    { label: "Landlord phone", value: clean(app.currentLandlordPhone) },
    { label: "Move in", value: clean(app.currentMoveIn) },
    { label: "Move out", value: clean(app.currentMoveOut) },
    { label: "Reason for leaving", value: clean(app.currentReasonLeaving) },
  ]);

  // ---- Previous residence -------------------------------------------------
  if (!app.noPreviousAddress) {
    const prevAddress = [
      clean(app.prevStreet),
      [clean(app.prevCity), clean(app.prevState)].filter(Boolean).join(", "),
      clean(app.prevZip),
    ]
      .filter(Boolean)
      .join("  ");
    drawSection("Previous residence", [
      { label: "Address", value: prevAddress },
      { label: "Landlord", value: clean(app.prevLandlordName) },
      { label: "Landlord phone", value: clean(app.prevLandlordPhone) },
      { label: "Move in", value: clean(app.prevMoveIn) },
      { label: "Move out", value: clean(app.prevMoveOut) },
      { label: "Reason for leaving", value: clean(app.prevReasonLeaving) },
    ]);
  }

  // ---- Employment & income ------------------------------------------------
  drawSection("Employment & income", [
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
  ]);

  // ---- References ---------------------------------------------------------
  drawSection("References", [
    {
      label: "Reference 1",
      value: [clean(app.ref1Name), clean(app.ref1Relationship), clean(app.ref1Phone)].filter(Boolean).join(" · "),
    },
    {
      label: "Reference 2",
      value: [clean(app.ref2Name), clean(app.ref2Relationship), clean(app.ref2Phone)].filter(Boolean).join(" · "),
    },
  ]);

  // ---- Disclosures --------------------------------------------------------
  drawSection("Disclosures", [
    { label: "Prior eviction", value: yesNo(app.evictionHistory) },
    { label: "Eviction details", value: clean(app.evictionDetails) },
    { label: "Bankruptcy", value: yesNo(app.bankruptcyHistory) },
    { label: "Bankruptcy details", value: clean(app.bankruptcyDetails) },
    { label: "Criminal history", value: yesNo(app.criminalHistory) },
    { label: "Criminal details", value: clean(app.criminalDetails) },
  ]);

  // ---- Consent & signature ------------------------------------------------
  drawSection("Consent & signature", [
    { label: "Credit/background consent", value: app.consentCredit ? "Authorized" : "" },
    { label: "Attestation of truth", value: app.consentTruth ? "Acknowledged" : "" },
    { label: "Application fee acknowledged", value: app.applicationFeeAcknowledged ? "Yes" : "" },
    { label: "Digital signature", value: clean(app.digitalSignature) },
    { label: "Date signed", value: clean(app.dateSigned) },
  ]);

  // ---- Manager notes ------------------------------------------------------
  drawFreeText("Manager notes", clean(row.detail));

  // ---- Footer -------------------------------------------------------------
  ensure(30);
  y -= 8;
  page.drawText(
    "Generated from Axis application records. Amounts and placement can change later in the lease or payment portal.",
    { x: MARGIN, y: y - 9, size: 8, font: italic, color: MUTED, maxWidth: contentWidth },
  );

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(`Axis ID ${clean(row.id) || "—"}`, { x: MARGIN, y: FOOTER_Y, size: 8, font: regular, color: MUTED });
    p.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 70,
      y: FOOTER_Y,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });

  return pdf.save();
}

/** Filesystem-safe download name for an application PDF. */
export function applicationPdfFilename(row: Pick<DemoApplicantRow, "id" | "name">): string {
  const name = clean(row.name).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const id = clean(row.id).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const base = [name || "application", id].filter(Boolean).join("-");
  return `${base}.pdf`;
}
