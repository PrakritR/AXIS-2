/**
 * Unified manager / admin / resident lease workflow backed by Supabase records.
 * Buckets match UI tabs: manager → admin → resident → signed.
 * Signing order: manager prepares/sends → resident signs → manager countersigns → fully signed.
 */

import { type ManagerLeaseBucket } from "@/data/demo-portal";
import { buildAiGeneratedLeaseHtml, leaseContextFromApplication } from "@/lib/generated-lease";
import { effectiveApplicationForRow, readManagerApplicationRows, signedRentLabelForRow } from "@/lib/manager-applications-storage";
import { getPropertyById, getRoomChoiceLabel } from "@/lib/rental-application/data";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import { clearUploadedOwnLease } from "@/lib/resident-lease-upload";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";

export const LEASE_PIPELINE_EVENT = "axis:lease-pipeline";
const LEASE_PIPELINE_SESSION_KEY = "axis:lease-pipeline:v1";

let memoryRows: LeasePipelineRow[] = [];
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
  managerUploadedPdf?: { dataUrl: string; fileName: string; uploadedAt: string } | null;
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
  const stageLabel = String(r.stageLabel ?? "").trim() || stageLabelForStatus(status);
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
    notes: typeof r.notes === "string" ? r.notes : String(r.notes ?? ""),
    updatedAtIso: typeof r.updatedAtIso === "string" && r.updatedAtIso.trim() ? r.updatedAtIso : isoFallback,
    axisId: typeof r.axisId === "string" ? r.axisId : undefined,
    propertyId: typeof r.propertyId === "string" ? r.propertyId : undefined,
    managerUserId: typeof r.managerUserId === "string" ? r.managerUserId : null,
    residentUserId: typeof r.residentUserId === "string" ? r.residentUserId : null,
    roomChoice: typeof r.roomChoice === "string" ? r.roomChoice : null,
    signedRentLabel: typeof r.signedRentLabel === "string" ? r.signedRentLabel : null,
    application: r.application,
    generatedHtml: r.generatedHtml ?? null,
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

function canUseStorage() {
  return typeof window !== "undefined";
}

function hydrateLeasePipelineFromSession() {
  if (!canUseStorage() || memoryRows.length > 0) return;
  try {
    const raw = window.sessionStorage.getItem(LEASE_PIPELINE_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return;
    memoryRows = parsed.map(normalizeLeasePipelineRow);
  } catch {
    /* ignore */
  }
}

function persistLeasePipelineToSession(rows: LeasePipelineRow[]) {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.setItem(LEASE_PIPELINE_SESSION_KEY, JSON.stringify(rows));
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

function readRaw(): LeasePipelineRow[] | null {
  hydrateLeasePipelineFromSession();
  return canUseStorage() ? memoryRows : null;
}

function write(rows: LeasePipelineRow[]) {
  if (!canUseStorage()) return;
  if (!leaseRowsChanged(memoryRows, rows)) return;
  memoryRows = rows;
  persistLeasePipelineToSession(rows);
  leasePipelineLastSyncedAt = Date.now();
  emit();
  void fetch("/api/portal-lease-pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "replace", rows }),
  }).catch(() => undefined);
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
    const idx = next.findIndex((r) => {
      if (r.axisId === app.id) return true;
      if (r.axisId) return false;
      return r.residentEmail.toLowerCase() === email && (r.propertyId ?? "") === propertyId;
    });
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
      application: effectiveApplicationForRow(app),
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
      application: effectiveApplicationForRow(app),
      residentName: app.name || r.residentName,
    };
  });
}

export function readLeasePipeline(managerUserId?: string | null): LeasePipelineRow[] {
  try {
    let stored = readRaw() ?? [];
    stored = stored.map(normalizeLeasePipelineRow);
    const rows = enrichFromApplications(stored);
    const merged = dedupeLeasePipelineRows(syncApprovedApplications(rows, managerUserId));
    if (JSON.stringify(merged) !== JSON.stringify(rows)) {
      return merged;
    }
    return rows;
  } catch {
    memoryRows = [];
    return [];
  }
}

export async function syncLeasePipelineFromServer(managerUserId?: string | null, opts?: { force?: boolean }): Promise<LeasePipelineRow[]> {
  if (!canUseStorage()) return [];
  hydrateLeasePipelineFromSession();
  const force = opts?.force === true;
  if (!force && leasePipelineSyncPromise) return leasePipelineSyncPromise;
  if (!force && leasePipelineLastSyncedAt > 0 && Date.now() - leasePipelineLastSyncedAt < LEASE_PIPELINE_SYNC_TTL_MS) {
    return readLeasePipeline(managerUserId);
  }
  try {
    leasePipelineSyncPromise = (async () => {
      const res = await fetch("/api/portal-lease-pipeline", { credentials: "include", cache: "no-store" });
      if (!res.ok) return readLeasePipeline(managerUserId);
      const body = (await res.json()) as { rows?: unknown[] };
      const fetched = (body.rows ?? []).map(normalizeLeasePipelineRow);
      const changed = leaseRowsChanged(memoryRows, fetched);
      memoryRows = fetched;
      persistLeasePipelineToSession(fetched);
      leasePipelineLastSyncedAt = Date.now();
      const next = readLeasePipeline(managerUserId);
      if (JSON.stringify(memoryRows) !== JSON.stringify(next)) {
        write(next);
        return next;
      }
      if (changed) emit();
      return next;
    })();
    return await leasePipelineSyncPromise;
  } finally {
    leasePipelineSyncPromise = null;
  }
}

export function syncLeasePipelineFromApplications(managerUserId?: string | null): LeasePipelineRow[] {
  const next = readLeasePipeline(managerUserId);
  if (canUseStorage() && JSON.stringify(memoryRows) !== JSON.stringify(next)) {
    write(next);
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

export function findLeaseForResidentEmail(email: string): LeasePipelineRow | null {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const matches = readLeasePipeline().filter((r) => r.residentEmail.toLowerCase() === e);
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

function makeMsg(role: LeaseThreadRole, body: string): LeaseThreadMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
    role,
    body: body.trim(),
  };
}

/** Removes a lease row and clears any resident-uploaded PDF keyed by that row's email (demo storage). */
export function deleteLeasePipelineRow(id: string): boolean {
  const rows = readLeasePipeline();
  const row = rows.find((r) => r.id === id);
  if (!row) return false;
  if (String(row.residentEmail ?? "").trim()) {
    clearUploadedOwnLease(row.residentEmail);
  }
  const next = rows.filter((r) => r.id !== id);
  write(next);
  return true;
}

export function updateLeasePipelineRow(id: string, patch: Partial<LeasePipelineRow>): boolean {
  const rows = readLeasePipeline();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const cur = rows[idx]!;
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
  const next = [...rows];
  next[idx] = nextRow;
  write(next);
  return true;
}

export function getLeaseDocumentHtml(row: LeasePipelineRow): string | null {
  return hasAnyLeaseSignature(row) ? applyLeaseSignaturesToHtml(row, row.generatedHtml) : row.generatedHtml ?? null;
}

export function recomputeLeaseSignedHtml(): boolean {
  return true;
}

export function appendLeaseThreadMessage(id: string, role: LeaseThreadRole, body: string): boolean {
  const rows = readLeasePipeline();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const cur = rows[idx]!;
  const msg = makeMsg(role, body);
  if (!msg.body) return false;
  const iso = new Date().toISOString();
  const nextRow: LeasePipelineRow = {
    ...cur,
    thread: [...(cur.thread ?? []), msg],
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
  };
  const next = [...rows];
  next[idx] = nextRow;
  write(next);
  return true;
}

export function generateLeaseHtmlForRow(rowId: string): { ok: true; version: number } | { ok: false; error: string } {
  const rows = readLeasePipeline();
  const row = rows.find((r) => r.id === rowId);
  if (!row) return { ok: false, error: "Lease not found." };
  if (row.status === "Fully Signed" || row.status === "Voided" || hasAnyLeaseSignature(row)) {
    return { ok: false, error: "This lease can no longer be regenerated after signatures. Void/restart it first." };
  }
  const app = row.application;
  if (!app || !Object.keys(app).length) {
    return { ok: false, error: "No application data on file — approve an application with saved answers first." };
  }
  let html: string;
  try {
    const ctx = leaseContextFromApplication(app as RentalWizardFormState);
    html = buildAiGeneratedLeaseHtml(ctx);
  } catch {
    return { ok: false, error: "Could not build lease from saved application — check answers or regenerate after fixing data." };
  }
  const version = (row.versionNumber ?? row.pdfVersion) + 1;
  const ok = updateLeasePipelineRow(rowId, {
    generatedHtml: html,
    managerUploadedPdf: null,
    generatedAtIso: new Date().toISOString(),
    pdfVersion: version,
    versionNumber: version,
    status: "Manager Review",
    currentActorRole: "manager",
    notes: row.notes,
  });
  return ok ? { ok: true, version } : { ok: false, error: "Could not save generated lease." };
}

/**
 * Regenerates lease HTML for every row that has application data.
 * Returns a summary of how many rows were updated vs skipped.
 */
export function regenerateAllLeaseHtml(): { updated: number; skipped: number } {
  const rows = readLeasePipeline();
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.status === "Fully Signed" || row.status === "Voided" || hasAnyLeaseSignature(row)) {
      skipped++;
      continue;
    }
    const app = row.application;
    if (!app || !Object.keys(app).length) {
      skipped++;
      continue;
    }
    try {
      const ctx = leaseContextFromApplication(app as RentalWizardFormState);
      const html = buildAiGeneratedLeaseHtml(ctx);
      const version = (row.versionNumber ?? row.pdfVersion) + 1;
      updateLeasePipelineRow(row.id, {
        generatedHtml: html,
        managerUploadedPdf: null,
        generatedAtIso: new Date().toISOString(),
        pdfVersion: version,
        versionNumber: version,
        status: "Manager Review",
        currentActorRole: "manager",
      });
      updated++;
    } catch {
      skipped++;
    }
  }
  return { updated, skipped };
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
    const key = row.axisId?.trim() || `${row.residentEmail.trim().toLowerCase()}::${row.propertyId ?? ""}::${row.roomChoice ?? ""}`;
    const existing = byAgreement.get(key);
    if (!existing) {
      byAgreement.set(key, row);
      continue;
    }
    const existingTs = Date.parse(existing.updatedAtIso || "");
    const rowTs = Date.parse(row.updatedAtIso || "");
    if ((Number.isFinite(rowTs) ? rowTs : 0) >= (Number.isFinite(existingTs) ? existingTs : 0)) {
      byAgreement.set(key, row);
    }
  }
  return [...byAgreement.values()];
}

export function managerUploadLeasePdf(rowId: string, file: File): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (file.type !== "application/pdf") {
      resolve({ ok: false, error: "Please choose a PDF file." });
      return;
    }
    if (file.size > 14 * 1024 * 1024) {
      resolve({ ok: false, error: "PDF too large (max 14 MB)." });
      return;
    }
    const rows = readLeasePipeline();
    const row = rows.find((r) => r.id === rowId);
    if (!row || !String(row.residentEmail ?? "").trim()) {
      resolve({ ok: false, error: "Missing resident email on lease row." });
      return;
    }
    if (row.status === "Fully Signed" || row.status === "Voided" || hasAnyLeaseSignature(row)) {
      resolve({ ok: false, error: "This lease can no longer be replaced after signatures. Void/restart it first." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const payload = {
        dataUrl,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      };
      const iso = new Date().toISOString();
      updateLeasePipelineRow(rowId, {
        managerUploadedPdf: payload,
        generatedHtml: null,
        pdfVersion: (row.versionNumber ?? row.pdfVersion) + 1,
        versionNumber: (row.versionNumber ?? row.pdfVersion) + 1,
        status: "Manager Review",
        currentActorRole: "manager",
        updatedAtIso: iso,
        updated: formatUpdatedLabel(iso),
      });
      resolve({ ok: true });
    };
    reader.onerror = () => resolve({ ok: false, error: "Could not read file." });
    reader.readAsDataURL(file);
  });
}

/** Resident electronically signs; row always moves to **signed** (awaiting manager countersign unless already fully executed). */
export function residentSignLease(email: string, signatureName?: string): boolean {
  const rows = readLeasePipeline();
  const idx = rows.findIndex((r) => r.residentEmail.toLowerCase() === email.trim().toLowerCase());
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
  rows[idx] = {
    ...nextRowBase,
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
export function managerSignLease(rowId: string, signatureName: string): boolean {
  const rows = readLeasePipeline();
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) return false;
  const row = rows[idx]!;
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
  const thread = [...(row.thread ?? []), makeMsg("manager", `Manager signed electronically — ${trimmedSignature}.`)];
  rows[idx] = {
    ...nextRowBase,
    bucket: "signed",
    status: bothSigned ? "Fully Signed" : "Manager Signature Pending",
    currentActorRole: bothSigned ? "system" : "manager",
    thread,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
    managerSignedAt: iso,
    fullySignedAt: bothSigned ? iso : null,
  };
  write(rows);
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
  const rows = readLeasePipeline();
  const idx = rows.findIndex((r) => r.residentEmail.toLowerCase() === email.trim().toLowerCase());
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

export function sendLeaseToResident(rowId: string): boolean {
  const rows = readLeasePipeline();
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (!row.generatedHtml && !row.managerUploadedPdf?.dataUrl) return false;
  if (row.status === "Fully Signed" || row.status === "Voided" || hasAnyLeaseSignature(row)) return false;
  const iso = new Date().toISOString();
  rows[idx] = normalizeLeasePipelineRow({
    ...row,
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
  write(rows);
  return true;
}

export function sendLeaseToAdminReview(rowId: string): boolean {
  const rows = readLeasePipeline();
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (row.status === "Fully Signed" || row.status === "Voided" || hasAnyLeaseSignature(row)) return false;
  const iso = new Date().toISOString();
  rows[idx] = normalizeLeasePipelineRow({
    ...row,
    bucket: "admin",
    status: "Admin Review",
    currentActorRole: "admin",
    adminReviewRequestedAt: iso,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
  });
  write(rows);
  return true;
}

export function sendLeaseBackToManager(rowId: string): boolean {
  const rows = readLeasePipeline();
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (row.status === "Fully Signed" || row.status === "Voided") return false;
  const iso = new Date().toISOString();
  rows[idx] = normalizeLeasePipelineRow({
    ...row,
    bucket: "manager",
    status: "Manager Review",
    currentActorRole: "manager",
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
  });
  write(rows);
  return true;
}
