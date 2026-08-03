import { isEditableLeaseSection, type LeaseSectionEdit } from "@/lib/lease-section-text";
import { parseLeaseHtmlSections, type LeaseHtmlSection } from "@/lib/lease-html-sections";
import {
  leaseAllowsManagerDocumentEdits,
  readLeasePipeline,
  updateLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";

export function leaseDocumentHtmlForSectionEdit(row: LeasePipelineRow): string | null {
  if (row.managerUploadedPdf?.dataUrl || row.templateDocumentUrl) return null;
  return row.generatedHtml?.trim() || null;
}

export function readLeaseSectionsForEdit(row: LeasePipelineRow): LeaseHtmlSection[] {
  const html = leaseDocumentHtmlForSectionEdit(row);
  return html ? parseLeaseHtmlSections(html) : [];
}

export function saveLeaseSectionEdits(
  leaseId: string,
  edits: Readonly<Record<string, LeaseSectionEdit>>,
  managerUserId?: string | null,
): { ok: true; row: LeasePipelineRow } | { ok: false; error: string } {
  const row = readLeasePipeline(managerUserId).find((candidate) => candidate.id === leaseId);
  if (!row) return { ok: false, error: "Lease not found." };
  if (!leaseAllowsManagerDocumentEdits(row)) return { ok: false, error: "This lease can no longer be edited." };

  const sections = readLeaseSectionsForEdit(row);
  if (!sections.length) return { ok: false, error: "No lease sections are available to edit." };
  const validEdits = Object.fromEntries(
    Object.entries(edits).filter(([sectionId, edit]) => {
      const section = sections.find((candidate) => candidate.id === sectionId);
      return Boolean(section && isEditableLeaseSection(section) && (edit.format === "text" || edit.format === "rich"));
    }),
  );
  if (!Object.keys(validEdits).length) return { ok: false, error: "Choose an editable lease section." };

  const saved = updateLeasePipelineRow(
    leaseId,
    { managerSectionEdits: { ...(row.managerSectionEdits ?? {}), ...validEdits } },
    managerUserId,
  );
  if (!saved) return { ok: false, error: "Could not save section edits." };
  const updated = readLeasePipeline(managerUserId).find((candidate) => candidate.id === leaseId);
  return updated ? { ok: true, row: updated } : { ok: false, error: "Saved but could not reload the lease." };
}
