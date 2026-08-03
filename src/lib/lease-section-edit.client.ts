import {
  applyLeaseSectionBodyEdits,
  parseLeaseHtmlSections,
  type LeaseHtmlSection,
} from "@/lib/lease-html-sections";
import { sanitizeManagerLeaseDocumentEdit } from "@/lib/lease-document-sanitizer";
import {
  leaseAllowsManagerDocumentEdits,
  readLeasePipeline,
  updateLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";

export function leaseDocumentHtmlForSectionEdit(row: LeasePipelineRow): string | null {
  // P6 template rows materialize the manager's original PDF plus Terms Rider
  // only at send time. Their temporary HTML preview is not the agreement body.
  if (row.managerUploadedPdf?.dataUrl || row.templateDocumentUrl) return null;
  return row.generatedHtml?.trim() || null;
}

export function readLeaseSectionsForEdit(row: LeasePipelineRow): LeaseHtmlSection[] {
  const html = leaseDocumentHtmlForSectionEdit(row);
  if (!html) return [];
  return parseLeaseHtmlSections(html);
}

export function saveLeaseSectionBodyEdits(
  leaseId: string,
  sectionEdits: Readonly<Record<string, string>>,
  managerUserId?: string | null,
): { ok: true; row: LeasePipelineRow } | { ok: false; error: string } {
  const row = readLeasePipeline(managerUserId).find((r) => r.id === leaseId);
  if (!row) return { ok: false, error: "Lease not found." };
  if (!leaseAllowsManagerDocumentEdits(row)) {
    return { ok: false, error: "This lease can no longer be edited." };
  }
  const baseHtml = leaseDocumentHtmlForSectionEdit(row);
  if (!baseHtml) {
    return { ok: false, error: "Upload a PDF lease or generate HTML before editing sections." };
  }
  if (!Object.keys(sectionEdits).length) {
    return { ok: false, error: "No section changes to save." };
  }

  const nextHtml = applyLeaseSectionBodyEdits(baseHtml, sectionEdits);
  return persistLeaseDocumentHtml(leaseId, nextHtml, managerUserId);
}

function persistLeaseDocumentHtml(
  leaseId: string,
  nextHtml: string,
  managerUserId?: string | null,
): { ok: true; row: LeasePipelineRow } | { ok: false; error: string } {
  const row = readLeasePipeline(managerUserId).find((r) => r.id === leaseId);
  if (!row) return { ok: false, error: "Lease not found." };
  if (!leaseAllowsManagerDocumentEdits(row)) {
    return { ok: false, error: "This lease can no longer be edited." };
  }
  const baseHtml = leaseDocumentHtmlForSectionEdit(row);
  if (!baseHtml) {
    return { ok: false, error: "Upload a PDF lease or generate HTML before editing." };
  }
  const sanitized = sanitizeManagerLeaseDocumentEdit(baseHtml, nextHtml);
  if (!sanitized.ok) return { ok: false, error: sanitized.error };
  if (sanitized.html.trim() === baseHtml.trim()) {
    return { ok: false, error: "No document changes to save." };
  }

  const iso = new Date().toISOString();
  const version = (row.versionNumber ?? row.pdfVersion ?? 0) + 1;
  const saved = updateLeasePipelineRow(
    leaseId,
    {
      generatedHtml: sanitized.html,
      generatedAtIso: iso,
      pdfVersion: version,
      versionNumber: version,
      managerDocumentEditedAtIso: iso,
      managerDocumentRegenerationRequiredAtIso: null,
      managerUploadedPdf: null,
      status: "Manager Review",
      currentActorRole: "manager",
      bucket: "manager",
    },
    managerUserId,
  );
  if (!saved) return { ok: false, error: "Could not save document edits." };
  const updated = readLeasePipeline(managerUserId).find((r) => r.id === leaseId);
  return updated ? { ok: true, row: updated } : { ok: false, error: "Saved but could not reload the lease." };
}

/** Save the full generated HTML after visual or multi-section editing. */
export function saveLeaseDocumentHtml(
  leaseId: string,
  documentHtml: string,
  managerUserId?: string | null,
): { ok: true; row: LeasePipelineRow } | { ok: false; error: string } {
  return persistLeaseDocumentHtml(leaseId, documentHtml, managerUserId);
}
