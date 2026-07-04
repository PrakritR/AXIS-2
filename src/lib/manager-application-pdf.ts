import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DemoApplicantRow } from "@/data/demo-portal";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import {
  displayableCustomFieldAnswers,
  formatCustomFieldAnswerDisplay,
} from "@/lib/rental-application/custom-fields";
import { formatLeaseDateLabel } from "@/lib/rental-application/lease-dates";
import { digitsOnly } from "@/lib/rental-application/masks";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const FOOTER_Y = 40;
const LABEL_X = MARGIN;
const VALUE_X = MARGIN + 168;

// Brand palette (mirrors src/app/globals.css design tokens).
const NAVY = rgb(0.043, 0.106, 0.227); // #0b1b3a  brand ink / header band
const BRAND = rgb(0.184, 0.42, 1); // #2f6bff  primary accent
const STEEL = rgb(0.737, 0.831, 1); // #bcd4ff  light accent on dark
const INK = rgb(0.12, 0.14, 0.18); // body text
const MUTED = rgb(0.4, 0.45, 0.52); // labels / secondary text
const RULE = rgb(0.86, 0.89, 0.93); // hairline rules
const PANEL_BG = rgb(0.953, 0.965, 1); // summary panel fill
const WHITE = rgb(1, 1, 1);

const HEADER_HEIGHT = 104; // brand band on page 1
const RUNNING_HEADER_HEIGHT = 30; // slim band on continuation pages

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

/** Never render full digits — last 4 only, matching the review-screen SSN mask. */
function maskSsn(ssn: string | null | undefined): string {
  const d = digitsOnly(clean(ssn));
  if (d.length !== 9) return "";
  return `•••-••-${d.slice(5)}`;
}

function groupRoleLabel(role: RentalWizardFormState["groupRole"] | undefined): string {
  if (role === "first") return "First applicant";
  if (role === "joining") return "Joining group";
  return "";
}

function feeChannelLabel(channel: RentalWizardFormState["applicationFeePayChannel"] | undefined): string {
  switch (channel) {
    case "ach":
      return "ACH";
    case "zelle":
      return "Zelle";
    case "venmo":
      return "Venmo";
    case "stripe":
      return "Card (Stripe)";
    case "other":
      return "Other";
    default:
      return "";
  }
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

/** Truncate to a single line that fits maxWidth, appending an ellipsis when clipped. */
function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1).trimEnd();
  }
  return `${out}…`;
}

/**
 * Draw the Axis "AX" monogram inside a rounded brand tile. Vector reproduction of
 * the app's <AxisLogoMark> glyph so the document header carries real branding.
 */
function drawAxisMark(page: PDFPage, x: number, topY: number, tile: number) {
  // Brand tile.
  page.drawRectangle({ x, y: topY - tile, width: tile, height: tile, color: BRAND });
  // Glyph is authored in a 46×26 viewBox; center it within the tile.
  const glyphW = tile * 0.62;
  const s = glyphW / 46;
  const gx = x + (tile - glyphW) / 2;
  const gTop = topY - (tile - 26 * s) / 2;
  const P = (vx: number, vy: number) => ({ x: gx + vx * s, y: gTop - vy * s });
  const stroke = Math.max(1.4, 2.55 * s);
  const line = (a: [number, number], b: [number, number], color = WHITE, thickness = stroke) =>
    page.drawLine({ start: P(a[0], a[1]), end: P(b[0], b[1]), thickness, color, lineCap: 1 });
  // "A"
  line([3.5, 21.5], [11, 4]);
  line([11, 4], [18.5, 21.5]);
  line([7.55, 14.25], [14.45, 14.25]);
  // "X"
  line([27, 4], [43, 22], STEEL, Math.max(1.4, 2.75 * s));
  line([43, 4], [27, 22]);
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

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const valueWidth = PAGE_WIDTH - MARGIN - VALUE_X;
  const applicantName = clean(app.fullLegalName) || clean(row.name) || "Applicant";
  const axisId = clean(row.id) || "—";
  const generated = options.generatedAt ? new Date(options.generatedAt) : new Date();
  const generatedLabel = generated.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const roomLabel = clean(options.roomLabel);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT;

  /** Slim brand band repeated at the top of continuation pages. */
  const drawRunningHeader = (p: PDFPage) => {
    p.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - RUNNING_HEADER_HEIGHT,
      width: PAGE_WIDTH,
      height: RUNNING_HEADER_HEIGHT,
      color: NAVY,
    });
    const midY = PAGE_HEIGHT - RUNNING_HEADER_HEIGHT / 2 - 3;
    p.drawText("AXIS", { x: MARGIN, y: midY, size: 9, font: bold, color: WHITE });
    p.drawText("Rental Application", { x: MARGIN + 34, y: midY, size: 9, font: regular, color: STEEL });
    const idText = `Axis ID ${axisId}`;
    p.drawText(idText, {
      x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(idText, 8.5),
      y: midY + 0.5,
      size: 8.5,
      font: regular,
      color: STEEL,
    });
  };

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawRunningHeader(page);
    y = PAGE_HEIGHT - RUNNING_HEADER_HEIGHT - 28;
  };
  const ensure = (needed: number) => {
    if (y - needed < FOOTER_Y + 26) newPage();
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

  const drawSectionHeader = (title: string) => {
    ensure(40);
    y -= 12;
    // Brand accent tick to the left of each section title.
    page.drawRectangle({ x: MARGIN, y: y - 11, width: 3, height: 11, color: BRAND });
    page.drawText(title.toUpperCase(), {
      x: MARGIN + 11,
      y: y - 10,
      size: 10.5,
      font: bold,
      color: NAVY,
    });
    y -= 16;
    page.drawLine({
      start: { x: MARGIN, y: y - 2 },
      end: { x: MARGIN + contentWidth, y: y - 2 },
      thickness: 0.75,
      color: RULE,
    });
    y -= 10;
  };

  const drawSection = (title: string, fields: Field[]) => {
    const populated = fields.filter((f) => f.value.trim());
    if (populated.length === 0) return;
    drawSectionHeader(title);
    for (const field of populated) drawField(field);
  };

  const drawFreeText = (title: string, body: string) => {
    const text = body.trim();
    if (!text) return;
    drawSectionHeader(title);
    y -= 2;
    for (const line of wrapText(text, regular, 10, contentWidth)) {
      ensure(14);
      page.drawText(line, { x: MARGIN, y: y - 9, size: 10, font: regular, color: INK });
      y -= 13;
    }
  };

  // ---- Branded header band -----------------------------------------------
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT, width: PAGE_WIDTH, height: HEADER_HEIGHT, color: NAVY });
  // Brand accent underline beneath the band.
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT - 3, width: PAGE_WIDTH, height: 3, color: BRAND });

  const bandTop = PAGE_HEIGHT - 30;
  drawAxisMark(page, MARGIN, bandTop, 40);
  const wordmarkX = MARGIN + 40 + 14;
  page.drawText("AXIS", { x: wordmarkX, y: bandTop - 17, size: 19, font: bold, color: WHITE });
  page.drawText("PROPERTY MANAGEMENT", {
    x: wordmarkX,
    y: bandTop - 32,
    size: 7.5,
    font: bold,
    color: STEEL,
  });

  const docTitle = "RENTAL APPLICATION";
  page.drawText(docTitle, {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(docTitle, 14),
    y: bandTop - 15,
    size: 14,
    font: bold,
    color: WHITE,
  });
  const docSub = "Official application record";
  page.drawText(docSub, {
    x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(docSub, 8.5),
    y: bandTop - 30,
    size: 8.5,
    font: regular,
    color: STEEL,
  });

  y = PAGE_HEIGHT - HEADER_HEIGHT - 3 - 24;

  // ---- Applicant identity + at-a-glance summary panel ---------------------
  page.drawText(applicantName, { x: MARGIN, y: y - 16, size: 17, font: bold, color: INK });
  y -= 22;
  page.drawText(
    `Axis ID ${axisId}    ·    ${statusLabel(row)}    ·    Generated ${generatedLabel}`,
    { x: MARGIN, y: y - 10, size: 9, font: regular, color: MUTED },
  );
  y -= 22;

  const summaryFields: Field[] = [
    { label: "Property", value: clean(row.property) || "—" },
    { label: "Room", value: roomLabel || clean(app.roomChoice1) || "—" },
    { label: "Move-in date", value: formatLeaseDateLabel(app.leaseStart) || clean(app.leaseStart) || "—" },
    {
      label: "Signed monthly rent",
      value:
        row.signedMonthlyRent && row.signedMonthlyRent > 0
          ? `$${row.signedMonthlyRent.toFixed(2)} / mo`
          : money(app.managerRentOverride) || "—",
    },
  ];
  const panelPadX = 18;
  const panelPadY = 16;
  const colGap = 24;
  const colWidth = (contentWidth - panelPadX * 2 - colGap) / 2;
  const rowH = 34;
  const panelHeight = panelPadY * 2 + rowH * 2 - 8;
  const panelTop = y;
  page.drawRectangle({
    x: MARGIN,
    y: panelTop - panelHeight,
    width: contentWidth,
    height: panelHeight,
    color: PANEL_BG,
    borderColor: RULE,
    borderWidth: 0.75,
  });
  summaryFields.forEach((field, i) => {
    const col = i % 2;
    const rowIdx = Math.floor(i / 2);
    const cellX = MARGIN + panelPadX + col * (colWidth + colGap);
    const cellTop = panelTop - panelPadY - rowIdx * rowH;
    page.drawText(field.label.toUpperCase(), { x: cellX, y: cellTop - 8, size: 7.5, font: bold, color: MUTED });
    page.drawText(truncateToWidth(field.value, bold, 11.5, colWidth), {
      x: cellX,
      y: cellTop - 23,
      size: 11.5,
      font: bold,
      color: NAVY,
    });
  });
  y = panelTop - panelHeight - 4;

  // ---- Applicant ----------------------------------------------------------
  drawSection("Applicant details", [
    { label: "Full legal name", value: applicantName },
    { label: "Email", value: clean(app.email) || clean(row.email) },
    { label: "Phone", value: clean(app.phone) },
    { label: "Date of birth", value: clean(app.dateOfBirth) },
    { label: "SSN", value: maskSsn(app.ssn) },
    { label: "Driver's license", value: clean(app.driversLicense) },
    { label: "Application status", value: statusLabel(row) },
    { label: "Stage", value: clean(row.stage) },
  ]);

  // ---- Property / placement ----------------------------------------------
  drawSection("Property & room", [
    { label: "Property", value: clean(row.property) },
    { label: "Room", value: roomLabel || clean(app.roomChoice1) },
    { label: "Second choice", value: roomLabel ? "" : clean(app.roomChoice2) },
    { label: "Third choice", value: roomLabel ? "" : clean(app.roomChoice3) },
    { label: "Rental type", value: app.rentalType === "short_term" ? "Short-term stay" : app.rentalType ? "Standard lease" : "" },
    { label: "Stay type / term", value: clean(app.leaseTerm) },
    { label: "Move-in date", value: formatLeaseDateLabel(app.leaseStart) || clean(app.leaseStart) },
    { label: "Lease end / move-out", value: formatLeaseDateLabel(app.leaseEnd) || clean(app.leaseEnd) },
    { label: "Check-in time", value: app.rentalType === "short_term" ? clean(app.shortTermCheckInTime) : "" },
    { label: "Check-out time", value: app.rentalType === "short_term" ? clean(app.shortTermCheckOutTime) : "" },
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
    { label: "Group role", value: groupRoleLabel(app.groupRole) },
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

  // ---- Manager-defined application questions -------------------------------
  // Manager-authored labels can be long; clip to the label column so they don't
  // collide with the answer column (standard labels are short and unaffected).
  drawSection(
    "Manager questions",
    displayableCustomFieldAnswers(app.customFieldAnswers).map((answer) => ({
      label: truncateToWidth(answer.label, bold, 9, VALUE_X - LABEL_X - 10),
      value: formatCustomFieldAnswerDisplay(answer),
    })),
  );

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
    { label: "Application fee payment method", value: feeChannelLabel(app.applicationFeePayChannel) },
    {
      label: "Manual fee payment confirmed",
      value:
        app.applicationFeePayChannel === "zelle" || app.applicationFeePayChannel === "venmo"
          ? yesNo(app.applicationFeeZelleSentConfirmed ? "yes" : "no")
          : "",
    },
    { label: "Digital signature", value: clean(app.digitalSignature) },
    { label: "Date signed", value: clean(app.dateSigned) },
  ]);

  // ---- Manager notes ------------------------------------------------------
  drawFreeText("Manager notes", clean(row.detail));

  // ---- Closing note -------------------------------------------------------
  ensure(30);
  y -= 12;
  page.drawText(
    "Generated from Axis application records. Amounts and placement can change later in the lease or payment portal.",
    { x: MARGIN, y: y - 9, size: 8, font: italic, color: MUTED, maxWidth: contentWidth },
  );

  // ---- Footer on every page ----------------------------------------------
  const pages = pdf.getPages();
  const footerLabel = `Axis Property Management  ·  Confidential`;
  pages.forEach((p, index) => {
    p.drawLine({
      start: { x: MARGIN, y: FOOTER_Y + 12 },
      end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_Y + 12 },
      thickness: 0.75,
      color: RULE,
    });
    p.drawText(footerLabel, { x: MARGIN, y: FOOTER_Y, size: 8, font: regular, color: MUTED });
    const idText = `Axis ID ${axisId}`;
    const idWidth = regular.widthOfTextAtSize(idText, 8);
    p.drawText(idText, { x: (PAGE_WIDTH - idWidth) / 2, y: FOOTER_Y, size: 8, font: regular, color: MUTED });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    p.drawText(pageText, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageText, 8),
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
