/**
 * Unified manager / admin / resident lease workflow backed by Supabase records.
 * Buckets match UI tabs: manager → admin → resident → signed.
 * Signing order: manager prepares/sends → resident signs → manager countersigns → fully signed.
 */

import { isDemoModeActive } from "@/lib/demo/demo-session";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { type ManagerLeaseBucket, type ManagerLeaseTab } from "@/data/demo-portal";
import { buildAiGeneratedLeaseHtml, leaseContextFromApplication } from "@/lib/generated-lease";
import {
  isLeaseGenerationSupported,
  resolveLeaseJurisdiction,
  unsupportedJurisdictionMessage,
} from "@/lib/lease-jurisdiction";
import { mergeUploadedLeasePdfWithSignatures } from "@/lib/lease-pdf-signing";
import { stripLeaseAiDisclaimerFromHtml, stripLeaseAiReviewDisclaimer } from "@/lib/lease-templates/types";
import { effectiveApplicationForRow, enrichApplicationForLease, readManagerApplicationRows, signedRentLabelForRow } from "@/lib/manager-applications-storage";
import { getPropertyById, getRoomChoiceLabel } from "@/lib/rental-application/data";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import { clearUploadedOwnLease } from "@/lib/resident-lease-upload";
import { applicationVisibleToPortalUser, leaseVisibleToPortalUser } from "@/lib/manager-portfolio-access";

export const LEASE_PIPELINE_EVENT = "axis:lease-pipeline";
const LEASE_PIPELINE_SESSION_KEY_PREFIX = "axis:lease-pipeline:v2";

let memoryRows: LeasePipelineRow[] = [];
let activeLeasePipelineScopeUserId: string | undefined;
const LEASE_PIPELINE_SYNC_TTL_MS = 15_000;
let leasePipelineLastSyncedAt = 0;
let leasePipelineSyncPromise: Promise<LeasePipelineRow[]> | null = null;

function leaseRowsChanged(a: LeasePipelineRow[], b: LeasePipelineRow[]) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeLeaseSignature(raw: unknown, role: "manager" | "resident"): LeaseSignature | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<LeaseSignature>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const signedAtIso = typeof r.signedAtIso === "string" ? r.signedAtIso.trim() : "";
  if (!name || !signedAtIso) return null;
  return { name, signedAtIso, role };
}

function signatureDateLabel(iso: string | undefined | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function electronicSignatureBlock(row: LeasePipelineRow): string {
  const manager = row.managerSignature ?? null;
  const resident = row.residentSignature ?? normalizeLeaseSignature(
    row.signatureName && row.signedAtIso
      ? { name: row.signatureName, signedAtIso: row.signedAtIso, role: "resident" }
      : null,
    "resident",
  );
  if (!manager && !resident) return "";
  const signatureCard = (label: string, sig: LeaseSignature | null) => `
    <div class="axis-esign-card">
      <p class="axis-esign-label">${escapeHtml(label)}</p>
      ${
        sig
          ? `<p class="axis-esign-name">${escapeHtml(sig.name)}</p><p class="axis-esign-meta">Electronically signed ${escapeHtml(signatureDateLabel(sig.signedAtIso))}</p>`
          : `<p class="axis-esign-pending">Pending signature</p>`
      }
    </div>`;

  return `
<!-- axis-signatures:start -->
<section class="axis-esign">
  <h2>Electronic Signature Certificate</h2>
  <p>This lease requires exactly two electronic signatures—one from the landlord / authorized agent and one from the resident / tenant. This certificate is the binding record for both. Each typed name below was accepted in the Axis portal as that party&apos;s electronic signature.</p>
  <div class="axis-esign-grid">
    ${signatureCard("Landlord / Authorized Agent", manager)}
    ${signatureCard("Resident / Tenant", resident)}
  </div>
</section>
<!-- axis-signatures:end -->`;
}

export function hasAnyLeaseSignature(row: LeasePipelineRow): boolean {
  return Boolean(row.managerSignature || row.residentSignature || (row.signatureName && row.signedAtIso));
}

/** True when the manager may generate, upload, or replace the lease document (manager review only). */
export function leaseAllowsManagerDocumentEdits(row: LeasePipelineRow): boolean {
  if (row.status === "Voided" || row.status === "Fully Signed") return false;
  if (hasAnyLeaseSignature(row)) return false;
  return row.bucket === "manager";
}

export function hasBothLeaseSignatures(row: LeasePipelineRow): boolean {
  return Boolean(row.managerSignature && (row.residentSignature || (row.signatureName && row.signedAtIso)));
}

/** True if the resident has completed their electronic signature (including legacy signature fields). */
export function residentHasSignedLease(row: LeasePipelineRow): boolean {
  return Boolean(
    (row.residentSignature?.name && row.residentSignature?.signedAtIso) || (row.signatureName && row.signedAtIso),
  );
}

export function applyLeaseSignaturesToHtml(row: LeasePipelineRow, html: string | null | undefined): string | null {
  if (!html) return null;
  const withoutExisting = html.replace(/\n?<!-- axis-signatures:start -->[\s\S]*?<!-- axis-signatures:end -->\n?/g, "\n");
  const block = electronicSignatureBlock(row);
  if (!block) return withoutExisting;
  const style = `
    .axis-esign { border-top: 3px double #333; margin-top: 3rem; padding-top: 1.5rem; }
    .axis-esign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
    .axis-esign-card { border: 1px solid #999; min-height: 108px; padding: 12px; }
    .axis-esign-label { margin: 0 0 0.5rem; font-weight: 700; }
    .axis-esign-name { margin: 0.35rem 0; font-size: 1.35rem; font-family: Georgia, "Times New Roman", serif; font-style: italic; }
    .axis-esign-meta, .axis-esign-pending { margin: 0; color: #555; font-size: 0.85rem; }
  `;
  const withStyle = withoutExisting.includes(".axis-esign")
    ? withoutExisting
    : withoutExisting.replace("</style>", `${style}</style>`);
  return withStyle.includes("</body>")
    ? withStyle.replace("</body>", `${block}\n</body>`)
    : `${withStyle}\n${block}`;
}

export type LeaseThreadRole = "manager" | "admin" | "resident";

export type LeaseThreadMessage = {
  id: string;
  at: string;
  role: LeaseThreadRole;
  body: string;
};

export type LeaseSignature = {
  name: string;
  signedAtIso: string;
  role: "manager" | "resident";
};

export type LeaseWorkflowStatus =
  | "Draft"
  | "Manager Review"
  | "Admin Review"
  | "Resident Signature Pending"
  | "Manager Signature Pending"
  | "Fully Signed"
  | "Voided";

export type LeasePipelineRow = {
  id: string;
  residentName: string;
  residentEmail: string;
  unit: string;
  stageLabel: string;
  updated: string;
  bucket: ManagerLeaseBucket;
  pdfVersion: number;
  notes: string;
  updatedAtIso: string;
  axisId?: string;
  propertyId?: string;
  managerUserId?: string | null;
  residentUserId?: string | null;
  roomChoice?: string | null;
  signedRentLabel?: string | null;
  application?: Partial<RentalWizardFormState>;
  generatedHtml?: string | null;
  generatedAtIso?: string | null;
  managerUploadedPdf?: { dataUrl: string; fileName: string; uploadedAt: string; originalDataUrl?: string } | null;
  thread: LeaseThreadMessage[];
  managerSignature?: LeaseSignature | null;
  residentSignature?: LeaseSignature | null;
  signatureName?: string | null;
  signedAtIso?: string | null;
  status?: LeaseWorkflowStatus;
  currentActorRole?: LeaseThreadRole | "system" | null;
  residentSignedAt?: string | null;
  managerSignedAt?: string | null;
  adminReviewRequestedAt?: string | null;
  sentToResidentAt?: string | null;
  fullySignedAt?: string | null;
  voidedAt?: string | null;
  versionNumber?: number;
};

function workflowStatusForRow(
  input: Pick<
    LeasePipelineRow,
    "bucket" | "managerSignature" | "residentSignature" | "signatureName" | "signedAtIso" | "voidedAt" | "generatedHtml" | "managerUploadedPdf"
  >,
): LeaseWorkflowStatus {
  const residentSigned = Boolean(
    (input.residentSignature?.name && input.residentSignature?.signedAtIso) || (input.signatureName && input.signedAtIso),
  );
  const managerSigned = Boolean(input.managerSignature?.name && input.managerSignature?.signedAtIso);
  if (input.voidedAt) return "Voided";
  if (managerSigned && residentSigned) return "Fully Signed";
  if (input.bucket === "admin") return "Admin Review";
  if (input.bucket === "resident") return "Resident Signature Pending";
  if (input.bucket === "signed") return "Manager Signature Pending";
  return input.generatedHtml || input.managerUploadedPdf ? "Manager Review" : "Draft";
}

function currentActorForStatus(status: LeaseWorkflowStatus): LeasePipelineRow["currentActorRole"] {
  switch (status) {
    case "Draft":
    case "Manager Review":
    case "Manager Signature Pending":
      return "manager";
    case "Admin Review":
      return "admin";
    case "Resident Signature Pending":
      return "resident";
    case "Fully Signed":
    case "Voided":
      return "system";
    default:
      return "system";
  }
}

function stageLabelForStatus(status: LeaseWorkflowStatus): string {
  if (status === "Fully Signed") return "Signed";
  return status;
}

/** Coerce partial rows from localStorage so UI never reads undefined thread / notes / bucket. */
export function normalizeLeasePipelineRow(raw: unknown): LeasePipelineRow {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LeasePipelineRow>;
  const b = r.bucket;
  const threads = Array.isArray(r.thread) ? r.thread : [];
  const safeThread: LeaseThreadMessage[] = threads.filter(
    (m): m is LeaseThreadMessage =>
      !!m &&
      typeof m === "object" &&
      typeof (m as LeaseThreadMessage).id === "string" &&
      typeof (m as LeaseThreadMessage).body === "string" &&
      typeof (m as LeaseThreadMessage).role === "string",
  );
  const id =
    typeof r.id === "string" && r.id.trim().length > 0
      ? r.id.trim()
      : `lease_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const isoFallback = new Date().toISOString();
  const legacyResidentSignature = normalizeLeaseSignature(
    r.signatureName && r.signedAtIso
      ? { name: r.signatureName, signedAtIso: r.signedAtIso, role: "resident" }
      : null,
    "resident",
  );
  const residentSignature = normalizeLeaseSignature(r.residentSignature, "resident") ?? legacyResidentSignature;
  const managerSignature = normalizeLeaseSignature(r.managerSignature, "manager");
  let bucket: ManagerLeaseBucket =
    b === "manager" || b === "admin" || b === "resident" || b === "signed" ? b : "manager";
  const residentSigned = Boolean(residentSignature?.name && residentSignature.signedAtIso);
  if (residentSigned && !managerSignature && bucket === "resident") bucket = "signed";
  const status = workflowStatusForRow({
    bucket,
    managerSignature,
    residentSignature,
    signatureName: typeof r.signatureName === "string" ? r.signatureName : residentSignature?.name ?? null,
    signedAtIso: typeof r.signedAtIso === "string" ? r.signedAtIso : residentSignature?.signedAtIso ?? null,
    voidedAt: typeof r.voidedAt === "string" ? r.voidedAt : null,
    generatedHtml: r.generatedHtml ?? null,
    managerUploadedPdf: r.managerUploadedPdf ?? null,
  });
  const stageLabel = stageLabelForStatus(status);
  const versionNumber =
    typeof r.versionNumber === "number" && Number.isFinite(r.versionNumber)
      ? Math.max(1, Math.floor(r.versionNumber))
      : typeof r.pdfVersion === "number" && Number.isFinite(r.pdfVersion)
        ? Math.max(1, Math.floor(r.pdfVersion))
        : 1;

  return {
    id,
    residentName: String(r.residentName ?? "").trim() || "—",
    residentEmail: String(r.residentEmail ?? "").trim(),
    unit: String(r.unit ?? "").trim() || "—",
    stageLabel,
    updated: String(r.updated ?? "").trim() || "—",
    bucket,
    pdfVersion: typeof r.pdfVersion === "number" && Number.isFinite(r.pdfVersion) ? Math.max(0, Math.floor(r.pdfVersion)) : 1,
    notes: stripLeaseAiReviewDisclaimer(typeof r.notes === "string" ? r.notes : String(r.notes ?? "")),
    updatedAtIso: typeof r.updatedAtIso === "string" && r.updatedAtIso.trim() ? r.updatedAtIso : isoFallback,
    axisId: typeof r.axisId === "string" ? r.axisId : undefined,
    propertyId: typeof r.propertyId === "string" ? r.propertyId : undefined,
    managerUserId: typeof r.managerUserId === "string" ? r.managerUserId : null,
    residentUserId: typeof r.residentUserId === "string" ? r.residentUserId : null,
    roomChoice: typeof r.roomChoice === "string" ? r.roomChoice : null,
    signedRentLabel: typeof r.signedRentLabel === "string" ? r.signedRentLabel : null,
    application: r.application,
    generatedHtml: stripLeaseAiDisclaimerFromHtml(r.generatedHtml ?? null),
    generatedAtIso: r.generatedAtIso ?? null,
    managerUploadedPdf: r.managerUploadedPdf ?? null,
    thread: safeThread,
    managerSignature,
    residentSignature,
    signatureName: typeof r.signatureName === "string" ? r.signatureName : residentSignature?.name ?? null,
    signedAtIso: typeof r.signedAtIso === "string" ? r.signedAtIso : residentSignature?.signedAtIso ?? null,
    status,
    currentActorRole:
      (typeof r.currentActorRole === "string" ? (r.currentActorRole as LeasePipelineRow["currentActorRole"]) : null) ??
      currentActorForStatus(status),
    residentSignedAt: typeof r.residentSignedAt === "string" ? r.residentSignedAt : residentSignature?.signedAtIso ?? null,
    managerSignedAt: typeof r.managerSignedAt === "string" ? r.managerSignedAt : managerSignature?.signedAtIso ?? null,
    adminReviewRequestedAt: typeof r.adminReviewRequestedAt === "string" ? r.adminReviewRequestedAt : null,
    sentToResidentAt: typeof r.sentToResidentAt === "string" ? r.sentToResidentAt : null,
    fullySignedAt:
      typeof r.fullySignedAt === "string"
        ? r.fullySignedAt
        : status === "Fully Signed"
          ? managerSignature?.signedAtIso ?? null
          : null,
    voidedAt: typeof r.voidedAt === "string" ? r.voidedAt : null,
    versionNumber,
  };
}

function leasePipelineSessionKey(scopeUserId?: string | null): string {
  if (scopeUserId) return `${LEASE_PIPELINE_SESSION_KEY_PREFIX}:${scopeUserId}`;
  return `${LEASE_PIPELINE_SESSION_KEY_PREFIX}:shared`;
}

function ensureLeasePipelineScope(scopeUserId?: string | null) {
  const nextScope = scopeUserId ?? undefined;
  if (activeLeasePipelineScopeUserId !== nextScope) {
    activeLeasePipelineScopeUserId = nextScope;
    memoryRows = [];
    leasePipelineLastSyncedAt = 0;
  }
}

function filterLeasesForManager(rows: LeasePipelineRow[], managerUserId?: string | null): LeasePipelineRow[] {
  if (!managerUserId) return rows;
  return rows.filter((row) => leaseVisibleToPortalUser(row, managerUserId));
}

function leaseAccessibleToManager(row: LeasePipelineRow | null | undefined, managerUserId?: string | null): row is LeasePipelineRow {
  if (!row) return false;
  if (!managerUserId) return true;
  return leaseVisibleToPortalUser(row, managerUserId);
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function hydrateLeasePipelineFromSession(scopeUserId?: string | null) {
  if (!canUseStorage()) return;
  if (memoryRows.length > 0) return;
  try {
    const raw = window.sessionStorage.getItem(leasePipelineSessionKey(scopeUserId));
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return;
    memoryRows = parsed.map(normalizeLeasePipelineRow);
  } catch {
    /* ignore */
  }
}

function persistLeasePipelineToSession(rows: LeasePipelineRow[], scopeUserId?: string | null) {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(leasePipelineSessionKey(scopeUserId ?? activeLeasePipelineScopeUserId), JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

function emit() {
  if (!canUseStorage()) return;
  queueMicrotask(() => {
    window.dispatchEvent(new Event(LEASE_PIPELINE_EVENT));
  });
}

function stageLabelForBucket(b: ManagerLeaseBucket): string {
  switch (b) {
    case "manager":
      return "Manager review";
    case "admin":
      return "Admin review";
    case "resident":
      return "Resident Signature Pending";
    case "signed":
      return "Manager Signature Pending";
    default:
      return "—";
  }
}

export function leaseRowMatchesManagerTab(row: LeasePipelineRow, tab: ManagerLeaseTab): boolean {
  if (tab === "completed") return row.status === "Fully Signed";
  if (tab === "signed") return row.bucket === "signed" && row.status !== "Fully Signed";
  return row.bucket === tab;
}

export function countManagerLeaseTabs(rows: LeasePipelineRow[]): Record<ManagerLeaseTab, number> {
  return {
    manager: rows.filter((r) => r.bucket === "manager").length,
    admin: rows.filter((r) => r.bucket === "admin").length,
    resident: rows.filter((r) => r.bucket === "resident").length,
    signed: rows.filter((r) => r.bucket === "signed" && r.status !== "Fully Signed").length,
    completed: rows.filter((r) => r.status === "Fully Signed").length,
  };
}

function formatUpdatedLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function approvedLeasePlacementLabel(input: {
  propertyId?: string;
  propertyLabel?: string;
  roomChoice?: string;
}): string {
  const propertyTitle =
    (input.propertyId ? getPropertyById(input.propertyId)?.title?.trim() : "") ||
    input.propertyLabel?.trim() ||
    "—";
  const roomLabel = input.roomChoice?.trim() ? getRoomChoiceLabel(input.roomChoice).split(" · ")[0]?.trim() || "" : "";
  return [propertyTitle, roomLabel].filter(Boolean).join(" · ") || propertyTitle || "—";
}

/** Demo seed: load lease-pipeline rows into the local store without server mirror. */
export function seedDemoLeasePipeline(rows: LeasePipelineRow[], scopeUserId: string): void {
  if (!canUseStorage()) return;
  ensureLeasePipelineScope(scopeUserId);
  memoryRows = rows.map(normalizeLeasePipelineRow);
  persistLeasePipelineToSession(memoryRows, scopeUserId);
  leasePipelineLastSyncedAt = Date.now();
  emit();
}

function readRaw(scopeUserId?: string | null): LeasePipelineRow[] | null {
  ensureLeasePipelineScope(scopeUserId);
  hydrateLeasePipelineFromSession(scopeUserId ?? activeLeasePipelineScopeUserId);
  return canUseStorage() ? memoryRows : null;
}

function write(rows: LeasePipelineRow[], scopeUserId?: string | null) {
  if (!canUseStorage()) return;
  ensureLeasePipelineScope(scopeUserId);
  if (!leaseRowsChanged(memoryRows, rows)) return;
  memoryRows = rows;
  persistLeasePipelineToSession(rows, scopeUserId ?? activeLeasePipelineScopeUserId);
  leasePipelineLastSyncedAt = Date.now();
  emit();
  // Demo sandbox is local-only: keep the in-memory/session write but never
  // mirror to the server.
  if (isDemoModeActive()) return;
  const payload = JSON.stringify({ action: "replace", rows });
  const byteLength = new TextEncoder().encode(payload).length;
  const shouldUseRowUpserts = byteLength > 3_500_000 || rows.some((row) => Boolean(row.managerUploadedPdf?.dataUrl));
  if (shouldUseRowUpserts) {
    for (const row of rows) persistLeaseRowToServer(row);
    return;
  }
  void fetch("/api/portal-lease-pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: payload,
  })
    .then(async (res) => {
      if (res.ok) return;
      for (const row of rows) persistLeaseRowToServer(row);
    })
    .catch(() => {
      for (const row of rows) persistLeaseRowToServer(row);
    });
}

function leaseAgreementKey(row: Pick<LeasePipelineRow, "axisId" | "residentEmail" | "propertyId" | "roomChoice">): string {
  return row.axisId?.trim() || `${row.residentEmail.trim().toLowerCase()}::${row.propertyId ?? ""}::${row.roomChoice ?? ""}`;
}

function findRawLeaseRowIndex(rowId: string, managerUserId?: string | null): number {
  const raw = materializeLeasePipeline(managerUserId);
  const directIdx = raw.findIndex((r) => r.id === rowId);
  if (directIdx !== -1) return directIdx;
  const logicalRow = raw.find((r) => r.id === rowId) ?? readLeasePipeline(managerUserId).find((r) => r.id === rowId);
  if (!logicalRow) return -1;
  const logicalKey = leaseAgreementKey(logicalRow);
  const matches = raw
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => leaseAgreementKey(row) === logicalKey);
  if (matches.length === 0) return -1;
  matches.sort((a, b) => {
    const aHasDoc = Number(Boolean(a.row.generatedHtml || a.row.managerUploadedPdf?.dataUrl));
    const bHasDoc = Number(Boolean(b.row.generatedHtml || b.row.managerUploadedPdf?.dataUrl));
    if (bHasDoc !== aHasDoc) return bHasDoc - aHasDoc;
    const aTs = Date.parse(a.row.updatedAtIso || "");
    const bTs = Date.parse(b.row.updatedAtIso || "");
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
  return matches[0]!.idx;
}

export type LeasePipelineActionResult = { ok: true } | { ok: false; error: string };

function persistLeaseRowToServer(row: LeasePipelineRow) {
  if (!canUseStorage() || isDemoModeActive()) return;
  void fetch("/api/portal-lease-pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "upsert", row }),
  }).catch(() => undefined);
}

async function persistLeaseRowToServerAwait(row: LeasePipelineRow): Promise<boolean> {
  if (!canUseStorage()) return false;
  if (isDemoModeActive()) return true;
  try {
    const res = await fetch("/api/portal-lease-pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "upsert", row }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function findLeaseRowIndexForApprovedApp(
  rows: LeasePipelineRow[],
  app: { id: string; email?: string; assignedPropertyId?: string; propertyId?: string; application?: { propertyId?: string } },
): number {
  const email = app.email?.trim().toLowerCase() ?? "";
  const propertyId =
    app.assignedPropertyId?.trim() || app.propertyId?.trim() || app.application?.propertyId?.trim() || "";
  const normalizedAppId = normalizeApplicationAxisId(app.id);

  const byAxisId = rows.findIndex(
    (r) => r.axisId?.trim() && normalizeApplicationAxisId(r.axisId) === normalizedAppId,
  );
  if (byAxisId !== -1) return byAxisId;

  if (email) {
    const byEmailProperty = rows.findIndex(
      (r) => r.residentEmail.toLowerCase() === email && (r.propertyId ?? "") === propertyId,
    );
    if (byEmailProperty !== -1) return byEmailProperty;

    // Resident email match when property assignment changed on the application.
    const byEmailOnly = rows.findIndex((r) => r.residentEmail.toLowerCase() === email && Boolean(r.sentToResidentAt || r.generatedHtml || r.managerUploadedPdf));
    if (byEmailOnly !== -1) return byEmailOnly;
  }

  return -1;
}

function syncApprovedApplications(rows: LeasePipelineRow[], managerUserId?: string | null): LeasePipelineRow[] {
  const apps = readManagerApplicationRows().filter(
    (a) =>
      a.bucket === "approved" &&
      a.email?.trim() &&
      (!managerUserId || applicationVisibleToPortalUser(a, managerUserId)),
  );
  let changed = false;
  const next = [...rows];
  for (const app of apps) {
    const email = app.email!.trim().toLowerCase();
    const propertyId = app.assignedPropertyId?.trim() || app.propertyId?.trim() || app.application?.propertyId?.trim() || "";
    const roomChoice = app.assignedRoomChoice?.trim() || app.application?.roomChoice1?.trim() || "";
    const effectiveManagerUserId = app.managerUserId ?? managerUserId ?? null;
    const unit = approvedLeasePlacementLabel({
      propertyId,
      propertyLabel: app.property,
      roomChoice,
    });
    const idx = findLeaseRowIndexForApprovedApp(next, app);
    const iso = new Date().toISOString();
    const seeded = normalizeLeasePipelineRow({
      id: idx === -1 ? `lease_app_${app.id}` : next[idx]!.id,
      residentName: String(app.name ?? "").trim() || "Applicant",
      residentEmail: email,
      unit,
      stageLabel: idx === -1 ? stageLabelForBucket("manager") : next[idx]!.stageLabel,
      updated: formatUpdatedLabel(iso),
      bucket: idx === -1 ? "manager" : next[idx]!.bucket,
      pdfVersion: idx === -1 ? 1 : next[idx]!.pdfVersion,
      notes: idx === -1 ? "Created from approved application." : next[idx]!.notes,
      updatedAtIso: idx === -1 ? iso : next[idx]!.updatedAtIso,
      axisId: app.id,
      propertyId: propertyId || undefined,
      managerUserId: effectiveManagerUserId,
      residentUserId: null,
      roomChoice: roomChoice || null,
      signedRentLabel: signedRentLabelForRow(app),
      application: effectiveApplicationForRow(app),
      generatedHtml: idx === -1 ? null : next[idx]!.generatedHtml,
      generatedAtIso: idx === -1 ? null : next[idx]!.generatedAtIso,
      managerUploadedPdf: idx === -1 ? null : next[idx]!.managerUploadedPdf,
      thread: idx === -1 ? [] : next[idx]!.thread,
      managerSignature: idx === -1 ? null : next[idx]!.managerSignature,
      residentSignature: idx === -1 ? null : next[idx]!.residentSignature,
      signatureName: idx === -1 ? null : next[idx]!.signatureName,
      signedAtIso: idx === -1 ? null : next[idx]!.signedAtIso,
    });
    if (idx === -1) {
      next.push(seeded);
      changed = true;
      continue;
    }
    const current = next[idx]!;
    const merged = normalizeLeasePipelineRow({
      ...current,
      residentName: seeded.residentName,
      residentEmail: seeded.residentEmail,
      unit: seeded.unit,
      axisId: app.id,
      propertyId: seeded.propertyId,
      managerUserId: seeded.managerUserId ?? managerUserId ?? current.managerUserId ?? null,
      roomChoice: seeded.roomChoice,
      signedRentLabel: seeded.signedRentLabel,
      application: enrichApplicationForLease(app, effectiveApplicationForRow(app), current.application),
    });
    if (JSON.stringify(merged) !== JSON.stringify(current)) {
      next[idx] = merged;
      changed = true;
    }
  }
  return changed ? next : rows;
}

/** Merge stored row with latest application answers when IDs match. */
function enrichFromApplications(rows: LeasePipelineRow[]): LeasePipelineRow[] {
  const apps = readManagerApplicationRows();
  return rows.map((r) => {
    if (!r.axisId) return r;
    const app = apps.find((a) => a.id === r.axisId);
    if (!app?.application) return r;
    return {
      ...r,
      unit:
        approvedLeasePlacementLabel({
          propertyId: app.assignedPropertyId?.trim() || app.propertyId?.trim() || app.application?.propertyId?.trim() || "",
          propertyLabel: app.property,
          roomChoice: app.assignedRoomChoice?.trim() || app.application?.roomChoice1?.trim() || "",
        }) || r.unit,
      propertyId: app.assignedPropertyId?.trim() || app.propertyId?.trim() || app.application?.propertyId?.trim() || r.propertyId,
      managerUserId: app.managerUserId ?? r.managerUserId ?? null,
      roomChoice: app.assignedRoomChoice?.trim() || app.application?.roomChoice1?.trim() || r.roomChoice,
      signedRentLabel: signedRentLabelForRow(app) ?? r.signedRentLabel,
      application: enrichApplicationForLease(app, effectiveApplicationForRow(app), r.application),
      residentName: app.name?.trim() || r.residentName,
      residentEmail: app.email?.trim().toLowerCase() || r.residentEmail,
    };
  });
}

function computeLeasePipelineRows(managerUserId?: string | null): LeasePipelineRow[] {
  ensureLeasePipelineScope(managerUserId);
  hydrateLeasePipelineFromSession(managerUserId);
  const stored = memoryRows.map(normalizeLeasePipelineRow);
  const rows = enrichFromApplications(stored);
  const merged = dedupeLeasePipelineRows(syncApprovedApplications(rows, managerUserId));
  return filterLeasesForManager(merged, managerUserId);
}

/** Persist application-seeded / merged rows so mutations can update raw storage. */
function materializeLeasePipeline(managerUserId?: string | null): LeasePipelineRow[] {
  const merged = computeLeasePipelineRows(managerUserId);
  if (!leaseRowsChanged(memoryRows, merged)) return merged;
  memoryRows = merged;
  persistLeasePipelineToSession(merged, managerUserId ?? activeLeasePipelineScopeUserId);
  return merged;
}

export function readLeasePipeline(managerUserId?: string | null): LeasePipelineRow[] {
  try {
    return computeLeasePipelineRows(managerUserId);
  } catch {
    memoryRows = [];
    return [];
  }
}

function preferLeasePipelineRow(local: LeasePipelineRow, remote: LeasePipelineRow): LeasePipelineRow {
  const localRank = residentLeasePriority(local);
  const remoteRank = residentLeasePriority(remote);
  if (localRank !== remoteRank) return localRank > remoteRank ? local : remote;
  const localTs = Date.parse(local.updatedAtIso || "");
  const remoteTs = Date.parse(remote.updatedAtIso || "");
  if (localTs !== remoteTs) {
    return (Number.isFinite(localTs) ? localTs : 0) > (Number.isFinite(remoteTs) ? remoteTs : 0) ? local : remote;
  }
  if (local.sentToResidentAt && !remote.sentToResidentAt) return local;
  if (remote.sentToResidentAt && !local.sentToResidentAt) return remote;
  return local;
}

function mergeLeasePipelineRows(local: LeasePipelineRow[], remote: LeasePipelineRow[]): LeasePipelineRow[] {
  const byId = new Map<string, LeasePipelineRow>();
  for (const row of remote) byId.set(row.id, normalizeLeasePipelineRow(row));
  for (const row of local) {
    const normalized = normalizeLeasePipelineRow(row);
    const existing = byId.get(normalized.id);
    byId.set(normalized.id, existing ? preferLeasePipelineRow(normalized, existing) : normalized);
  }
  return [...byId.values()];
}

export async function syncLeasePipelineFromServer(managerUserId?: string | null, opts?: { force?: boolean }): Promise<LeasePipelineRow[]> {
  if (!canUseStorage()) return [];
  ensureLeasePipelineScope(managerUserId);
  hydrateLeasePipelineFromSession(managerUserId);
  if (isDemoModeActive()) return readLeasePipeline(managerUserId);
  const force = opts?.force === true;
  if (!force && leasePipelineSyncPromise) return leasePipelineSyncPromise;
  if (!force && leasePipelineLastSyncedAt > 0 && Date.now() - leasePipelineLastSyncedAt < LEASE_PIPELINE_SYNC_TTL_MS) {
    return readLeasePipeline(managerUserId);
  }
  try {
    leasePipelineSyncPromise = (async () => {
      const localSnapshot = readLeasePipeline(managerUserId);
      const res = await fetch("/api/portal-lease-pipeline", { credentials: "include", cache: "no-store" });
      if (!res.ok) return localSnapshot;
      const body = (await res.json()) as { rows?: unknown[] };
      const fetched = filterLeasesForManager((body.rows ?? []).map(normalizeLeasePipelineRow), managerUserId);
      const merged = dedupeLeasePipelineRows(mergeLeasePipelineRows(localSnapshot, fetched));
      memoryRows = merged;
      persistLeasePipelineToSession(merged, managerUserId);
      leasePipelineLastSyncedAt = Date.now();
      emit();
      return readLeasePipeline(managerUserId);
    })();
    return await leasePipelineSyncPromise;
  } finally {
    leasePipelineSyncPromise = null;
  }
}

export function syncLeasePipelineFromApplications(managerUserId?: string | null): LeasePipelineRow[] {
  const next = readLeasePipeline(managerUserId);
  if (canUseStorage() && JSON.stringify(memoryRows) !== JSON.stringify(next)) {
    write(next, managerUserId);
  }
  return next;
}

export function leasePipelineBucketCounts(): [number, number, number, number] {
  const rows = readLeasePipeline();
  return [
    rows.filter((r) => r.bucket === "manager").length,
    rows.filter((r) => r.bucket === "admin").length,
    rows.filter((r) => r.bucket === "resident").length,
    rows.filter((r) => r.bucket === "signed").length,
  ];
}

export function residentCanViewLeaseRow(row: LeasePipelineRow | null | undefined): boolean {
  if (!row) return false;
  const hasDocument = Boolean(row.generatedHtml || row.managerUploadedPdf?.dataUrl);
  if (!hasDocument) return false;
  return (
    row.status === "Resident Signature Pending" ||
    row.status === "Manager Signature Pending" ||
    row.status === "Fully Signed"
  );
}

export type ResidentLeaseAuthContext = {
  email?: string | null;
  residentAxisId?: string | null;
  profileManagerId?: string | null;
};

/** True when a lease belongs to the resident's approved manager-client relationship. */
export function residentLeaseAuthorized(row: LeasePipelineRow, ctx: ResidentLeaseAuthContext): boolean {
  const email = ctx.email?.trim().toLowerCase() || "";
  if (!email || row.residentEmail.trim().toLowerCase() !== email) return false;

  const residentAxisId = ctx.residentAxisId?.trim() || ctx.profileManagerId?.trim() || "";
  if (residentAxisId && row.axisId?.trim()) {
    const normalizedResident = residentAxisId.toUpperCase();
    const normalizedLease = row.axisId.trim().toUpperCase();
    if (normalizedLease === normalizedResident) return true;
  }

  if (residentAxisId) {
    const app = readManagerApplicationRows().find((a) => {
      const appId = a.id.trim().toUpperCase();
      return appId === residentAxisId.toUpperCase() && a.email?.trim().toLowerCase() === email;
    });
    if (app && row.axisId?.trim() && app.id.trim().toUpperCase() === row.axisId.trim().toUpperCase()) return true;
    if (app?.managerUserId && row.managerUserId && app.managerUserId === row.managerUserId) return true;
  }

  // API-scoped fetch is authoritative; allow when email matches and no conflicting axis binding.
  return !residentAxisId || !row.axisId?.trim();
}

function residentLeasePriority(row: LeasePipelineRow): number {
  switch (row.status) {
    case "Fully Signed":
      return 5;
    case "Manager Signature Pending":
      return 4;
    case "Resident Signature Pending":
      return 3;
    case "Manager Review":
      return 2;
    case "Admin Review":
      return 1;
    default:
      return 0;
  }
}

export function findLeaseForResidentEmail(email: string, auth?: ResidentLeaseAuthContext): LeasePipelineRow | null {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const ctx: ResidentLeaseAuthContext = { email: e, ...auth };
  const matches = readLeasePipeline()
    .filter((r) => r.residentEmail.toLowerCase() === e)
    .filter((r) => residentLeaseAuthorized(r, ctx));
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const visibleDelta = Number(residentCanViewLeaseRow(b)) - Number(residentCanViewLeaseRow(a));
    if (visibleDelta !== 0) return visibleDelta;
    const priorityDelta = residentLeasePriority(b) - residentLeasePriority(a);
    if (priorityDelta !== 0) return priorityDelta;
    const aTs = Date.parse(a.updatedAtIso || "");
    const bTs = Date.parse(b.updatedAtIso || "");
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
  return matches[0] ?? null;
}

function findActiveResidentLeaseRawIndex(email: string): number {
  const activeRow = findLeaseForResidentEmail(email);
  if (activeRow) {
    const rawIdx = findRawLeaseRowIndex(activeRow.id);
    if (rawIdx !== -1) return rawIdx;
  }
  const key = email.trim().toLowerCase();
  const raw = readRaw() ?? [];
  const matches = raw
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => row.residentEmail.trim().toLowerCase() === key);
  if (matches.length === 0) return -1;
  matches.sort((a, b) => {
    const aTs = Date.parse(a.row.updatedAtIso || "");
    const bTs = Date.parse(b.row.updatedAtIso || "");
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
  return matches[0]!.idx;
}

function makeMsg(role: LeaseThreadRole, body: string): LeaseThreadMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
    role,
    body: body.trim(),
  };
}

/** Removes lease document content and resets workflow to manager review on the same row. */
export function deleteLeasePipelineRow(id: string, managerUserId?: string | null): boolean {
  const rows = readLeasePipeline(managerUserId);
  const row = rows.find((r) => r.id === id);
  if (!leaseAccessibleToManager(row, managerUserId)) return false;
  if (String(row.residentEmail ?? "").trim()) {
    clearUploadedOwnLease(row.residentEmail);
  }
  const raw = [...materializeLeasePipeline(managerUserId)];
  const rawIdx = findRawLeaseRowIndex(id, managerUserId);
  if (rawIdx === -1) return false;
  const iso = new Date().toISOString();
  raw[rawIdx] = normalizeLeasePipelineRow({
    ...row,
    bucket: "manager",
    generatedHtml: null,
    generatedAtIso: null,
    managerUploadedPdf: null,
    managerSignature: null,
    residentSignature: null,
    signatureName: null,
    signedAtIso: null,
    residentSignedAt: null,
    managerSignedAt: null,
    sentToResidentAt: null,
    fullySignedAt: null,
    adminReviewRequestedAt: null,
    voidedAt: null,
    pdfVersion: 1,
    versionNumber: 1,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
  });
  write(raw, managerUserId);
  return true;
}

export function deleteLeasePipelineRowsForResident(
  residentEmail: string,
  axisId?: string | null,
  managerUserId?: string | null,
): number {
  const email = residentEmail.trim().toLowerCase();
  const normalizedAxisId = axisId?.trim() || "";
  if (!email && !normalizedAxisId) return 0;
  const rows = readLeasePipeline(managerUserId);
  const removedRows = rows.filter((row) => {
    const rowEmail = row.residentEmail.trim().toLowerCase();
    return (email && rowEmail === email) || (normalizedAxisId && row.axisId?.trim() === normalizedAxisId);
  });
  if (removedRows.length === 0) return 0;
  for (const row of removedRows) {
    if (String(row.residentEmail ?? "").trim()) {
      clearUploadedOwnLease(row.residentEmail);
    }
  }
  const raw = [...(readRaw(managerUserId) ?? [])];
  const removedIds = new Set(removedRows.map((r) => r.id));
  write(
    raw.filter((row) => !removedIds.has(row.id)),
    managerUserId,
  );
  return removedRows.length;
}

export function updateLeasePipelineRow(id: string, patch: Partial<LeasePipelineRow>, managerUserId?: string | null): boolean {
  const rows = readLeasePipeline(managerUserId);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const cur = rows[idx]!;
  if (!leaseAccessibleToManager(cur, managerUserId)) return false;
  const iso = new Date().toISOString();
  const nextRow = normalizeLeasePipelineRow({
    ...cur,
    ...patch,
    updatedAtIso: patch.updatedAtIso ?? iso,
    updated: patch.updated ?? formatUpdatedLabel(patch.updatedAtIso ?? iso),
    versionNumber: patch.versionNumber ?? cur.versionNumber ?? cur.pdfVersion,
  });
  nextRow.stageLabel = patch.stageLabel ?? stageLabelForStatus(nextRow.status ?? workflowStatusForRow(nextRow));
  nextRow.currentActorRole = patch.currentActorRole ?? currentActorForStatus(nextRow.status ?? workflowStatusForRow(nextRow));
  const raw = [...materializeLeasePipeline(managerUserId)];
  const rawIdx = findRawLeaseRowIndex(id, managerUserId);
  if (rawIdx === -1) return false;
  raw[rawIdx] = nextRow;
  write(raw, managerUserId);
  return true;
}

export function getLeaseDocumentHtml(row: LeasePipelineRow): string | null {
  const raw = hasAnyLeaseSignature(row) ? applyLeaseSignaturesToHtml(row, row.generatedHtml) : row.generatedHtml ?? null;
  return stripLeaseAiDisclaimerFromHtml(raw);
}

export function recomputeLeaseSignedHtml(): boolean {
  return true;
}

export function appendLeaseThreadMessage(
  id: string,
  role: LeaseThreadRole,
  body: string,
  managerUserId?: string | null,
): boolean {
  const rows = readLeasePipeline(managerUserId);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const cur = rows[idx]!;
  if (!leaseAccessibleToManager(cur, managerUserId)) return false;
  const msg = makeMsg(role, body);
  if (!msg.body) return false;
  const iso = new Date().toISOString();
  const nextRow: LeasePipelineRow = {
    ...cur,
    thread: [...(cur.thread ?? []), msg],
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
  };
  const raw = [...materializeLeasePipeline(managerUserId)];
  const rawIdx = findRawLeaseRowIndex(id, managerUserId);
  if (rawIdx === -1) return false;
  raw[rawIdx] = nextRow;
  write(raw, managerUserId);
  return true;
}

function applicationSnapshotForLeaseRow(row: LeasePipelineRow): Partial<RentalWizardFormState> | undefined {
  if (!row.application || !Object.keys(row.application).length) return undefined;
  if (!row.axisId) return row.application;
  const appRow = readManagerApplicationRows().find((a) => a.id === row.axisId);
  if (!appRow?.application) return row.application;
  return enrichApplicationForLease(appRow, effectiveApplicationForRow(appRow), row.application);
}

export function leaseGenerationSupportedForRow(row: LeasePipelineRow): { ok: true } | { ok: false; error: string } {
  const app = applicationSnapshotForLeaseRow(row);
  if (!app || !Object.keys(app).length) {
    return { ok: false, error: "No application data on file." };
  }
  const ctx = leaseContextFromApplication(app as RentalWizardFormState);
  const jurisdiction = resolveLeaseJurisdiction(ctx);
  if (!isLeaseGenerationSupported(jurisdiction)) {
    return { ok: false, error: unsupportedJurisdictionMessage(jurisdiction) };
  }
  return { ok: true };
}

async function refreshUploadedPdfSignatures(row: LeasePipelineRow): Promise<LeasePipelineRow["managerUploadedPdf"]> {
  if (!row.managerUploadedPdf?.dataUrl) return row.managerUploadedPdf ?? null;
  try {
    const merged = await mergeUploadedLeasePdfWithSignatures(row);
    if (!merged) return row.managerUploadedPdf;
    return { ...row.managerUploadedPdf, dataUrl: merged };
  } catch {
    return row.managerUploadedPdf;
  }
}

export function generateLeaseHtmlForRow(
  rowId: string,
  managerUserId?: string | null,
): { ok: true; version: number } | { ok: false; error: string } {
  const rows = readLeasePipeline(managerUserId);
  const row = rows.find((r) => r.id === rowId);
  if (!leaseAccessibleToManager(row, managerUserId)) return { ok: false, error: "Lease not found." };
  if (!leaseAllowsManagerDocumentEdits(row)) {
    return { ok: false, error: "Move the lease back to manager review before generating a new document." };
  }
  const app = applicationSnapshotForLeaseRow(row);
  if (!app || !Object.keys(app).length) {
    return { ok: false, error: "No application data on file — approve an application with saved answers first." };
  }
  const supported = leaseGenerationSupportedForRow(row);
  if (!supported.ok) return { ok: false, error: supported.error };
  let html: string;
  try {
    const ctx = leaseContextFromApplication(app as RentalWizardFormState);
    html = buildAiGeneratedLeaseHtml(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not build lease from saved application.";
    return { ok: false, error: msg };
  }
  const version = (row.versionNumber ?? row.pdfVersion) + 1;
  const ok = updateLeasePipelineRow(
    rowId,
    {
      application: app,
      generatedHtml: html,
      managerUploadedPdf: null,
      generatedAtIso: new Date().toISOString(),
      pdfVersion: version,
      versionNumber: version,
      status: "Manager Review",
      currentActorRole: "manager",
    },
    managerUserId,
  );
  return ok ? { ok: true, version } : { ok: false, error: "Could not save generated lease." };
}

/**
 * Persist enriched application snapshots (phone, email, DOB, name) from linked application records.
 */
export function refreshAllLeaseApplicationSnapshots(managerUserId?: string | null): number {
  const raw = [...materializeLeasePipeline(managerUserId)];
  const apps = readManagerApplicationRows();
  let refreshed = 0;
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]!;
    if (!row.axisId) continue;
    const app = apps.find((a) => a.id === row.axisId);
    if (!app?.application) continue;
    const enrichedApp = enrichApplicationForLease(app, effectiveApplicationForRow(app), row.application);
    const nextRow = normalizeLeasePipelineRow({
      ...row,
      application: enrichedApp,
      residentName: app.name?.trim() || row.residentName,
      residentEmail: app.email?.trim().toLowerCase() || row.residentEmail,
    });
    if (JSON.stringify(nextRow.application) === JSON.stringify(row.application) &&
        nextRow.residentName === row.residentName &&
        nextRow.residentEmail === row.residentEmail) {
      continue;
    }
    raw[i] = nextRow;
    refreshed++;
  }
  if (refreshed > 0) write(raw, managerUserId);
  return refreshed;
}

/**
 * Regenerates lease HTML for every row that has application data.
 * Returns a summary of how many rows were updated vs skipped.
 */
export function regenerateAllLeaseHtml(managerUserId?: string | null): {
  updated: number;
  skipped: number;
  snapshotsRefreshed: number;
} {
  const snapshotsRefreshed = refreshAllLeaseApplicationSnapshots(managerUserId);
  const rows = readLeasePipeline(managerUserId);
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.status === "Voided") {
      skipped++;
      continue;
    }
    const app = applicationSnapshotForLeaseRow(row);
    if (!app || !Object.keys(app).length) {
      skipped++;
      continue;
    }
    const signed = row.status === "Fully Signed" || hasBothLeaseSignatures(row);
    if (signed) {
      try {
        const ctx = leaseContextFromApplication(app as RentalWizardFormState);
        if (!isLeaseGenerationSupported(resolveLeaseJurisdiction(ctx))) {
          skipped++;
          continue;
        }
        const html = buildAiGeneratedLeaseHtml(ctx);
        updateLeasePipelineRow(
          row.id,
          {
            application: app,
            generatedHtml: html,
            generatedAtIso: new Date().toISOString(),
          },
          managerUserId,
        );
        updated++;
      } catch {
        skipped++;
      }
      continue;
    }
    if (hasAnyLeaseSignature(row)) {
      skipped++;
      continue;
    }
    if (!leaseAllowsManagerDocumentEdits(row)) {
      skipped++;
      continue;
    }
    try {
      const ctx = leaseContextFromApplication(app as RentalWizardFormState);
      if (!isLeaseGenerationSupported(resolveLeaseJurisdiction(ctx))) {
        skipped++;
        continue;
      }
      const html = buildAiGeneratedLeaseHtml(ctx);
      const version = (row.versionNumber ?? row.pdfVersion) + 1;
      updateLeasePipelineRow(
        row.id,
        {
          generatedHtml: html,
          managerUploadedPdf: null,
          generatedAtIso: new Date().toISOString(),
          pdfVersion: version,
          versionNumber: version,
          status: "Manager Review",
          currentActorRole: "manager",
        },
        managerUserId,
      );
      updated++;
    } catch {
      skipped++;
    }
  }
  return { updated, skipped, snapshotsRefreshed };
}

export function downloadLeaseFromRow(row: LeasePipelineRow): void {
  if (typeof window === "undefined") return;
  if (row.managerUploadedPdf?.dataUrl) {
    const a = document.createElement("a");
    a.href = row.managerUploadedPdf.dataUrl;
    a.download = row.managerUploadedPdf.fileName || "lease.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  if (row.generatedHtml) {
    printLeaseAsPdf(row);
    return;
  }
}

export function dedupeLeasePipelineRows(rows: LeasePipelineRow[]): LeasePipelineRow[] {
  const byAgreement = new Map<string, LeasePipelineRow>();
  for (const row of rows) {
    const key =
      row.axisId?.trim() ||
      `${row.residentEmail.trim().toLowerCase()}::${row.propertyId ?? ""}::${row.roomChoice ?? ""}`;
    const existing = byAgreement.get(key);
    if (!existing) {
      byAgreement.set(key, row);
      continue;
    }
    byAgreement.set(key, preferLeasePipelineRow(row, existing));
  }
  return [...byAgreement.values()];
}

export function managerUploadLeasePdf(
  rowId: string,
  file: File,
  managerUserId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (file.type !== "application/pdf") {
      resolve({ ok: false, error: "Please choose a PDF file." });
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      resolve({ ok: false, error: "PDF too large (max 3.5 MB)." });
      return;
    }
    const rows = [...(readRaw(managerUserId) ?? readLeasePipeline(managerUserId))];
    const idx = findRawLeaseRowIndex(rowId, managerUserId);
    const row = idx === -1 ? null : rows[idx]!;
    if (!leaseAccessibleToManager(row, managerUserId) || !String(row.residentEmail ?? "").trim()) {
      resolve({ ok: false, error: "Missing resident email on lease row." });
      return;
    }
    if (!leaseAllowsManagerDocumentEdits(row)) {
      resolve({ ok: false, error: "Move the lease back to manager review before uploading a new PDF." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const payload = {
        dataUrl,
        originalDataUrl: dataUrl,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      };
      const iso = new Date().toISOString();
      const nextVersion = (row.versionNumber ?? row.pdfVersion) + 1;
      rows[idx] = normalizeLeasePipelineRow({
        ...row,
        bucket: "manager",
        managerUploadedPdf: payload,
        generatedHtml: null,
        generatedAtIso: null,
        pdfVersion: nextVersion,
        versionNumber: nextVersion,
        status: "Manager Review",
        currentActorRole: "manager",
        updatedAtIso: iso,
        updated: formatUpdatedLabel(iso),
        managerSignature: null,
        residentSignature: null,
        signatureName: null,
        signedAtIso: null,
        residentSignedAt: null,
        managerSignedAt: null,
        sentToResidentAt: null,
        fullySignedAt: null,
        voidedAt: null,
      });
      write(rows, managerUserId);
      resolve({ ok: true });
    };
    reader.onerror = () => resolve({ ok: false, error: "Could not read file." });
    reader.readAsDataURL(file);
  });
}

export function residentUploadLeasePdf(email: string, file: File): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (file.type !== "application/pdf") {
      resolve({ ok: false, error: "Please choose a PDF file." });
      return;
    }
    if (file.size > 3.5 * 1024 * 1024) {
      resolve({ ok: false, error: "PDF too large (max 3.5 MB)." });
      return;
    }
    const key = email.trim().toLowerCase();
    const rows = [...(readRaw() ?? readLeasePipeline())];
    const idx = findActiveResidentLeaseRawIndex(key);
    const row = idx === -1 ? null : rows[idx]!;
    if (!row) {
      resolve({ ok: false, error: "Lease not found." });
      return;
    }
    if (row.status !== "Resident Signature Pending") {
      resolve({ ok: false, error: "This lease is not currently with the resident." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const iso = new Date().toISOString();
      const nextVersion = (row.versionNumber ?? row.pdfVersion) + 1;
      rows[idx] = normalizeLeasePipelineRow({
        ...row,
        managerUploadedPdf: {
          dataUrl,
          originalDataUrl: dataUrl,
          fileName: file.name,
          uploadedAt: iso,
        },
        generatedHtml: null,
        generatedAtIso: null,
        pdfVersion: nextVersion,
        versionNumber: nextVersion,
        updatedAtIso: iso,
        updated: formatUpdatedLabel(iso),
        managerSignature: null,
        residentSignature: null,
        signatureName: null,
        signedAtIso: null,
        residentSignedAt: null,
        managerSignedAt: null,
        fullySignedAt: null,
        bucket: "resident",
        status: "Resident Signature Pending",
      });
      write(rows);
      resolve({ ok: true });
    };
    reader.onerror = () => resolve({ ok: false, error: "Could not read file." });
    reader.readAsDataURL(file);
  });
}

/** Resident electronically signs; row always moves to **signed** (awaiting manager countersign unless already fully executed). */
export async function residentSignLease(email: string, signatureName?: string): Promise<boolean> {
  const rows = [...(readRaw() ?? readLeasePipeline())];
  const idx = findActiveResidentLeaseRawIndex(email);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (row.status !== "Resident Signature Pending" || row.bucket !== "resident" || row.residentSignature) return false;
  const iso = new Date().toISOString();
  const trimmedSignature = signatureName?.trim() || row.residentName || "Resident";
  const residentSignature: LeaseSignature = { role: "resident", name: trimmedSignature, signedAtIso: iso };
  const sigMsg = `Resident signed electronically — ${trimmedSignature}.`;
  const thread = [...(row.thread ?? []), makeMsg("resident", sigMsg)];
  const nextRowBase = normalizeLeasePipelineRow({
    ...row,
    residentSignature,
    signatureName: trimmedSignature,
    signedAtIso: iso,
  });
  const bothSigned = hasBothLeaseSignatures(nextRowBase);
  const mergedPdf = await refreshUploadedPdfSignatures(nextRowBase);
  rows[idx] = {
    ...nextRowBase,
    managerUploadedPdf: mergedPdf ?? nextRowBase.managerUploadedPdf,
    bucket: "signed",
    status: bothSigned ? "Fully Signed" : "Manager Signature Pending",
    currentActorRole: bothSigned ? "system" : "manager",
    thread,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
    notes: row.notes,
    residentSignedAt: iso,
    sentToResidentAt: row.sentToResidentAt ?? row.updatedAtIso,
    fullySignedAt: bothSigned ? iso : null,
  };
  write(rows);
  return true;
}

/** Manager / authorized agent electronically countersigns (only after the resident has signed). */
export async function managerSignLease(rowId: string, signatureName: string, managerUserId?: string | null): Promise<boolean> {
  const rows = readLeasePipeline(managerUserId);
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (!leaseAccessibleToManager(row, managerUserId)) return false;
  if (row.status !== "Manager Signature Pending" || row.bucket !== "signed" || !residentHasSignedLease(row) || row.managerSignature) return false;
  const trimmedSignature = signatureName.trim();
  if (!trimmedSignature) return false;
  const iso = new Date().toISOString();
  const managerSignature: LeaseSignature = { role: "manager", name: trimmedSignature, signedAtIso: iso };
  const nextRowBase = normalizeLeasePipelineRow({
    ...row,
    managerSignature,
  });
  const bothSigned = hasBothLeaseSignatures(nextRowBase);
  const mergedPdf = await refreshUploadedPdfSignatures(nextRowBase);
  const thread = [...(row.thread ?? []), makeMsg("manager", `Manager signed electronically — ${trimmedSignature}.`)];
  const raw = [...(readRaw(managerUserId) ?? [])];
  const rawIdx = raw.findIndex((r) => r.id === rowId);
  if (rawIdx === -1) return false;
  raw[rawIdx] = {
    ...nextRowBase,
    managerUploadedPdf: mergedPdf ?? nextRowBase.managerUploadedPdf,
    bucket: "signed",
    status: bothSigned ? "Fully Signed" : "Manager Signature Pending",
    currentActorRole: bothSigned ? "system" : "manager",
    thread,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
    managerSignedAt: iso,
    fullySignedAt: bothSigned ? iso : null,
  };
  write(raw, managerUserId);
  return true;
}

/** Open the lease in a print-ready popup — browser saves as PDF from the print dialog. */
export function printLeaseAsPdf(row: LeasePipelineRow): void {
  if (typeof window === "undefined") return;
  if (row.managerUploadedPdf?.dataUrl) {
    const a = document.createElement("a");
    a.href = row.managerUploadedPdf.dataUrl;
    a.download = row.managerUploadedPdf.fileName || "lease.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const html = getLeaseDocumentHtml(row);
  if (!html) return;
  const printHtml = html.replace(
    "</head>",
    `<style>@media print{body{margin:0}}</style><script>window.onload=function(){window.print();}<\/script></head>`,
  );
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(printHtml);
  win.document.close();
}

export function residentRequestEdits(email: string, message: string): boolean {
  const rows = [...(readRaw() ?? readLeasePipeline())];
  const idx = findActiveResidentLeaseRawIndex(email);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (row.bucket !== "resident") return false;
  if (!message.trim()) return false;
  const iso = new Date().toISOString();
  const thread = [...(row.thread ?? []), makeMsg("resident", message)];
  rows[idx] = {
    ...row,
    bucket: "manager",
    status: "Manager Review",
    currentActorRole: "manager",
    thread,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
  };
  write(rows);
  return true;
}

export function residentSendLeaseToManager(email: string): boolean {
  const key = email.trim().toLowerCase();
  const rows = [...(readRaw() ?? readLeasePipeline())];
  const idx = findActiveResidentLeaseRawIndex(key);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (row.status !== "Resident Signature Pending") return false;
  if (!row.managerUploadedPdf?.dataUrl) return false;
  const iso = new Date().toISOString();
  const thread = [
    ...(row.thread ?? []),
    makeMsg("resident", "Resident uploaded the signed PDF and sent it back to the manager."),
  ];
  rows[idx] = normalizeLeasePipelineRow({
    ...row,
    bucket: "signed",
    status: "Manager Signature Pending",
    currentActorRole: "manager",
    thread,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
  });
  write(rows);
  return true;
}

export async function sendLeaseToResident(rowId: string, managerUserId?: string | null): Promise<LeasePipelineActionResult> {
  const logical = readLeasePipeline(managerUserId).find((r) => r.id === rowId);
  if (!logical || !leaseAccessibleToManager(logical, managerUserId)) {
    return { ok: false, error: "Lease not found." };
  }
  if (!logical.generatedHtml && !logical.managerUploadedPdf?.dataUrl) {
    return { ok: false, error: "Generate or upload a lease document first." };
  }
  if (logical.status === "Fully Signed" || logical.status === "Voided") {
    return { ok: false, error: "This lease is already finalized." };
  }
  if (residentHasSignedLease(logical) || logical.managerSignature) {
    return { ok: false, error: "This lease already has signatures and cannot be re-sent." };
  }
  const raw = [...materializeLeasePipeline(managerUserId)];
  const idx = findRawLeaseRowIndex(rowId, managerUserId);
  if (idx === -1) return { ok: false, error: "Lease record could not be saved locally." };
  const row = raw[idx]!;
  const iso = new Date().toISOString();
  const updated = normalizeLeasePipelineRow({
    ...row,
    managerUserId: row.managerUserId ?? managerUserId ?? null,
    bucket: "resident",
    status: "Resident Signature Pending",
    currentActorRole: "resident",
    sentToResidentAt: iso,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
    managerSignature: null,
    residentSignature: null,
    signatureName: null,
    signedAtIso: null,
  });
  const persisted = await persistLeaseRowToServerAwait(updated);
  if (!persisted) {
    return { ok: false, error: "Lease could not be saved to the server. Check your connection and try again." };
  }
  raw[idx] = updated;
  write(raw, managerUserId);
  return { ok: true };
}

export function sendLeaseToAdminReview(rowId: string, managerUserId?: string | null): LeasePipelineActionResult {
  const rows = readLeasePipeline(managerUserId);
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) return { ok: false, error: "Lease not found." };
  const row = rows[idx]!;
  if (!leaseAccessibleToManager(row, managerUserId)) return { ok: false, error: "Lease not found." };
  if (row.status === "Fully Signed" || row.status === "Voided" || hasAnyLeaseSignature(row)) {
    return { ok: false, error: "This lease can no longer be sent for admin review." };
  }
  const iso = new Date().toISOString();
  const raw = [...materializeLeasePipeline(managerUserId)];
  const rawIdx = findRawLeaseRowIndex(rowId, managerUserId);
  if (rawIdx === -1) return { ok: false, error: "Lease record could not be saved locally." };
  raw[rawIdx] = normalizeLeasePipelineRow({
    ...row,
    bucket: "admin",
    status: "Admin Review",
    currentActorRole: "admin",
    adminReviewRequestedAt: iso,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
  });
  write(raw, managerUserId);
  return { ok: true };
}

export function sendLeaseBackToManager(rowId: string, managerUserId?: string | null): LeasePipelineActionResult {
  const rows = readLeasePipeline(managerUserId);
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) return { ok: false, error: "Lease not found." };
  const row = rows[idx]!;
  if (!leaseAccessibleToManager(row, managerUserId)) return { ok: false, error: "Lease not found." };
  if (row.status === "Fully Signed" || row.status === "Voided") {
    return { ok: false, error: "This lease is already finalized." };
  }
  const iso = new Date().toISOString();
  const raw = [...materializeLeasePipeline(managerUserId)];
  const rawIdx = findRawLeaseRowIndex(rowId, managerUserId);
  if (rawIdx === -1) return { ok: false, error: "Lease record could not be saved locally." };
  raw[rawIdx] = normalizeLeasePipelineRow({
    ...row,
    bucket: "manager",
    status: "Manager Review",
    currentActorRole: "manager",
    managerSignature: null,
    residentSignature: null,
    signatureName: null,
    signedAtIso: null,
    sentToResidentAt: null,
    residentSignedAt: null,
    managerSignedAt: null,
    fullySignedAt: null,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
  });
  write(raw, managerUserId);
  return { ok: true };
}
