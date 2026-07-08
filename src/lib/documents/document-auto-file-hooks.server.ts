/**
 * Event hooks that mirror business documents into the manager document library
 * (Documents Phase 4). These run on server write paths — lease fully signed,
 * work-order approve+pay, expense receipt upload — and delegate to
 * {@link autoFileDocumentToLibrary}, which is a no-op unless the manager has
 * opted the category into `manager_automation_settings.document_auto_file`.
 *
 * Every hook is best-effort: callers wrap them in try/catch (or `.catch`) so a
 * filing failure never blocks the underlying business action. The heavy client
 * lease module (lease-pipeline-storage) is intentionally NOT imported here — it
 * carries browser-only state — so we rebuild a minimal signature summary from
 * the row instead.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoFileDocumentToLibrary } from "@/lib/documents/document-auto-file.server";
import { renderHtmlDocumentPdf } from "@/lib/reports/export/document-pdf";

function dataUrlToBuffer(dataUrl: string): { bytes: Buffer; mimeType: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl.trim());
  if (!match) return null;
  const mimeType = (match[1] || "application/octet-stream").trim();
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  const bytes = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  if (bytes.length === 0) return null;
  return { bytes, mimeType };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal fully-signed lease row shape (subset of LeasePipelineRow). */
export type AutoFileLeaseRow = {
  id: string;
  residentName?: string | null;
  residentEmail?: string | null;
  unit?: string | null;
  propertyId?: string | null;
  managerUserId?: string | null;
  residentUserId?: string | null;
  generatedHtml?: string | null;
  managerUploadedPdf?: { dataUrl?: string | null; fileName?: string | null } | null;
  fullySignedAt?: string | null;
  managerSignature?: { name?: string | null; signedAtIso?: string | null } | null;
  residentSignature?: { name?: string | null; signedAtIso?: string | null } | null;
};

function leaseSignatureFooterHtml(row: AutoFileLeaseRow): string {
  const line = (label: string, sig?: { name?: string | null; signedAtIso?: string | null } | null) => {
    if (!sig?.name) return `<p>${escapeHtml(label)}: Pending</p>`;
    const when = sig.signedAtIso ? new Date(sig.signedAtIso).toLocaleString("en-US") : "";
    return `<p>${escapeHtml(label)}: ${escapeHtml(sig.name)}${when ? ` — signed ${escapeHtml(when)}` : ""}</p>`;
  };
  return `<h3>Electronic Signature Certificate</h3>${line("Landlord / Authorized Agent", row.managerSignature)}${line("Resident / Tenant", row.residentSignature)}`;
}

/**
 * Mirror a fully-signed lease into the library. Prefers the manager-uploaded
 * signed PDF (already carries the signature page); otherwise renders the
 * generated lease HTML — with a signature summary appended — to a branded PDF.
 * Returns the new document id, or null when auto-file is off / nothing to file.
 */
export async function autoFileLeaseDocument(
  db: SupabaseClient,
  row: AutoFileLeaseRow,
): Promise<string | null> {
  const managerUserId = (row.managerUserId ?? "").trim();
  if (!managerUserId) return null;

  const resident = (row.residentName ?? "").trim() || "Resident";
  const unit = (row.unit ?? "").trim();
  const displayName = `Lease — ${resident}${unit ? ` — ${unit}` : ""}`;

  let bytes: Buffer;
  let mimeType: string;

  const pdfDataUrl = row.managerUploadedPdf?.dataUrl ?? null;
  const decoded = pdfDataUrl ? dataUrlToBuffer(pdfDataUrl) : null;
  if (decoded && decoded.mimeType.includes("pdf")) {
    bytes = decoded.bytes;
    mimeType = "application/pdf";
  } else if ((row.generatedHtml ?? "").trim()) {
    const html = `${row.generatedHtml}${leaseSignatureFooterHtml(row)}`;
    const rendered = await renderHtmlDocumentPdf({
      title: "Residential Lease Agreement",
      subtitle: `${resident}${unit ? ` · ${unit}` : ""}`,
      html,
    });
    bytes = Buffer.from(rendered);
    mimeType = "application/pdf";
  } else {
    return null;
  }

  return autoFileDocumentToLibrary(db, {
    managerUserId,
    category: "lease",
    autoFileKind: "lease",
    displayName,
    bytes,
    mimeType,
    propertyId: row.propertyId ?? null,
    leaseId: row.id,
    residentUserId: row.residentUserId ?? null,
    residentEmail: row.residentEmail ?? null,
  });
}

export type AutoFileWorkOrderReceiptInput = {
  managerUserId: string;
  workOrderId: string;
  title?: string | null;
  propertyLabel?: string | null;
  propertyId?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  vendorCostCents?: number | null;
  materialsCostCents?: number | null;
  workDoneSummary?: string | null;
  paidAtIso?: string | null;
  paymentChannel?: string | null;
};

function usd(cents: number | null | undefined): string {
  return `$${(Math.max(0, Math.round(Number(cents) || 0)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Mirror a work-order payment receipt into the library when the manager pays a
 * completed job. Builds a branded receipt PDF (labor + materials + total) and
 * files it under the "invoice" auto-file category.
 */
export async function autoFileWorkOrderReceipt(
  db: SupabaseClient,
  input: AutoFileWorkOrderReceiptInput,
): Promise<string | null> {
  const managerUserId = (input.managerUserId ?? "").trim();
  if (!managerUserId) return null;

  const labor = Math.max(0, Math.round(Number(input.vendorCostCents) || 0));
  const materials = Math.max(0, Math.round(Number(input.materialsCostCents) || 0));
  const total = labor + materials;
  const title = (input.title ?? "").trim() || "Work order";
  const paidAt = input.paidAtIso ? new Date(input.paidAtIso).toLocaleString("en-US") : new Date().toLocaleString("en-US");

  const rows: string[] = [
    `<p><strong>Work order:</strong> ${escapeHtml(title)}</p>`,
    input.propertyLabel ? `<p><strong>Property:</strong> ${escapeHtml(input.propertyLabel)}</p>` : "",
    input.vendorName ? `<p><strong>Vendor:</strong> ${escapeHtml(input.vendorName)}</p>` : "",
    `<p><strong>Paid:</strong> ${escapeHtml(paidAt)}${input.paymentChannel ? ` (${escapeHtml(input.paymentChannel)})` : ""}</p>`,
    input.workDoneSummary ? `<p><strong>Work performed:</strong> ${escapeHtml(input.workDoneSummary)}</p>` : "",
    "<h3>Charges</h3>",
    `<p>Labor: ${usd(labor)}</p>`,
    `<p>Materials: ${usd(materials)}</p>`,
    `<p><strong>Total paid: ${usd(total)}</strong></p>`,
  ];

  const rendered = await renderHtmlDocumentPdf({
    title: "Work Order Payment Receipt",
    subtitle: title,
    html: rows.filter(Boolean).join(""),
  });

  return autoFileDocumentToLibrary(db, {
    managerUserId,
    category: "invoice",
    autoFileKind: "invoice",
    displayName: `Receipt — ${title}`,
    bytes: Buffer.from(rendered),
    mimeType: "application/pdf",
    propertyId: input.propertyId ?? null,
    vendorId: input.vendorId ?? null,
    workOrderId: input.workOrderId,
  });
}

export type AutoFileExpenseReceiptInput = {
  managerUserId: string;
  expenseId: string;
  displayName: string;
  dataUrl: string;
  propertyId?: string | null;
  vendorId?: string | null;
};

/**
 * Mirror an uploaded expense receipt (a data URL from the expense form) into
 * the library under the "expense_receipt" auto-file category.
 */
export async function autoFileExpenseReceipt(
  db: SupabaseClient,
  input: AutoFileExpenseReceiptInput,
): Promise<string | null> {
  const managerUserId = (input.managerUserId ?? "").trim();
  if (!managerUserId) return null;
  const decoded = dataUrlToBuffer(input.dataUrl);
  if (!decoded) return null;

  return autoFileDocumentToLibrary(db, {
    managerUserId,
    category: "invoice",
    autoFileKind: "expense_receipt",
    displayName: input.displayName,
    bytes: decoded.bytes,
    mimeType: decoded.mimeType,
    propertyId: input.propertyId ?? null,
    vendorId: input.vendorId ?? null,
  });
}
