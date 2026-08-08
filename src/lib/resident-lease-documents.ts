import type { LeasePipelineRow, SignedLeaseSnapshot } from "@/lib/lease-pipeline-storage";
import { hasBothLeaseSignatures, residentCanViewLeaseRow } from "@/lib/lease-pipeline-storage";

export type ResidentLeaseDocumentRow = {
  id: string;
  leaseRowId: string;
  label: string;
  status: string;
  signedAt: string;
  snapshot: SignedLeaseSnapshot | null;
  pipelineRow: LeasePipelineRow | null;
};

export function encodeLeaseDocumentDetailId(leaseRowId: string, snapshotId?: string | null): string {
  if (!snapshotId) return leaseRowId;
  return `${leaseRowId}--${snapshotId}`;
}

export function decodeLeaseDocumentDetailId(detailId: string): { leaseRowId: string; snapshotId: string | null } {
  const sep = detailId.indexOf("--");
  if (sep === -1) return { leaseRowId: detailId, snapshotId: null };
  return { leaseRowId: detailId.slice(0, sep), snapshotId: detailId.slice(sep + 2) || null };
}

export function buildResidentLeaseDocumentRows(row: LeasePipelineRow | null): ResidentLeaseDocumentRow[] {
  if (!row) return [];

  const rows: ResidentLeaseDocumentRow[] = [];
  for (const snapshot of row.signedLeaseSnapshots ?? []) {
    rows.push({
      id: encodeLeaseDocumentDetailId(row.id, snapshot.id),
      leaseRowId: row.id,
      label: snapshot.label,
      status: "Prior lease",
      signedAt: snapshot.fullySignedAt,
      snapshot,
      pipelineRow: null,
    });
  }

  if (hasBothLeaseSignatures(row)) {
    rows.unshift({
      id: encodeLeaseDocumentDetailId(row.id),
      leaseRowId: row.id,
      label: `Current lease${row.unit ? ` · ${row.unit}` : ""}`,
      status: "Fully signed",
      signedAt: row.fullySignedAt ?? row.updatedAtIso,
      snapshot: null,
      pipelineRow: row,
    });
  } else if (residentCanViewLeaseRow(row)) {
    rows.unshift({
      id: encodeLeaseDocumentDetailId(row.id),
      leaseRowId: row.id,
      label: row.pendingRenewal
        ? `Renewal in progress${row.unit ? ` · ${row.unit}` : ""}`
        : `Lease agreement${row.unit ? ` · ${row.unit}` : ""}`,
      status: row.status ?? "Pending signatures",
      signedAt: row.updatedAtIso,
      snapshot: null,
      pipelineRow: row,
    });
  }

  return rows;
}

export function resolveResidentLeaseDocumentView(
  row: LeasePipelineRow | null,
  detailId: string,
): {
  title: string;
  subtitle: string;
  pdfSrc: string | null;
  leaseHtml: string | null;
  pipelineRow: LeasePipelineRow | null;
} | null {
  if (!row) return null;
  const { leaseRowId, snapshotId } = decodeLeaseDocumentDetailId(detailId);
  if (leaseRowId !== row.id) return null;

  if (snapshotId) {
    const snapshot = (row.signedLeaseSnapshots ?? []).find((entry) => entry.id === snapshotId);
    if (!snapshot) return null;
    return {
      title: snapshot.label,
      subtitle: `Signed · ${snapshot.fullySignedAt}`,
      pdfSrc: snapshot.managerUploadedPdf?.dataUrl ?? null,
      leaseHtml: snapshot.generatedHtml ?? null,
      pipelineRow: null,
    };
  }

  const pdfSrc = row.managerUploadedPdf?.dataUrl ?? null;
  const leaseHtml = pdfSrc ? null : row.generatedHtml ?? null;
  const signedAt = row.fullySignedAt ?? row.updatedAtIso;
  const title = hasBothLeaseSignatures(row)
    ? `Current lease${row.unit ? ` · ${row.unit}` : ""}`
    : row.pendingRenewal
      ? `Renewal in progress${row.unit ? ` · ${row.unit}` : ""}`
      : `Lease agreement${row.unit ? ` · ${row.unit}` : ""}`;
  return {
    title,
    subtitle: hasBothLeaseSignatures(row) ? `Fully signed · ${signedAt}` : row.status ?? "Pending signatures",
    pdfSrc,
    leaseHtml,
    pipelineRow: row,
  };
}
