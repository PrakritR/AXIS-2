/**
 * Unified manager / admin / resident lease workflow (demo localStorage).
 * Buckets match UI tabs: manager → admin → resident → signed.
 */

import {
  demoManagerLeaseDraftRows,
  type DemoManagerLeaseDraftRow,
  type ManagerLeaseBucket,
} from "@/data/demo-portal";
import { buildAiGeneratedLeaseHtml, leaseContextFromApplication } from "@/lib/generated-lease";
import { effectiveApplicationForRow, readManagerApplicationRows } from "@/lib/manager-applications-storage";
import type { RentalWizardFormState } from "@/lib/rental-application/types";
import { clearUploadedOwnLease, readUploadedOwnLease, saveUploadedOwnLease } from "@/lib/resident-lease-upload";

export const LEASE_PIPELINE_EVENT = "axis:lease-pipeline";

/** Bumped to drop legacy demo-seeded rows from localStorage; pipeline now starts empty until apps sync. */
const STORAGE_KEY = "axis_lease_pipeline_v3";

/** Demo-only email map so residents can load their lease row. */
const DEMO_RESIDENT_EMAIL: Record<string, string> = {
  lease_demo_1: "alex.chen@example.com",
  lease_demo_2: "jordan.lee@example.com",
  lease_demo_3: "sam.rivera@example.com",
  lease_demo_4: "priya.nair@example.com",
};

const DEMO_APPLICATION_IDS: Record<string, string> = {
  lease_demo_1: "app_demo_3",
  lease_demo_2: "app_demo_1",
  lease_demo_3: "app_demo_2",
  lease_demo_4: "app_demo_4",
};

export type LeaseThreadRole = "manager" | "admin" | "resident";

export type LeaseThreadMessage = {
  id: string;
  at: string;
  role: LeaseThreadRole;
  body: string;
};

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
  application?: Partial<RentalWizardFormState>;
  generatedHtml?: string | null;
  generatedAtIso?: string | null;
  managerUploadedPdf?: { dataUrl: string; fileName: string; uploadedAt: string } | null;
  thread: LeaseThreadMessage[];
  signatureName?: string | null;
  signedAtIso?: string | null;
};

/** Coerce partial rows from localStorage so UI never reads undefined thread / notes / bucket. */
export function normalizeLeasePipelineRow(raw: unknown): LeasePipelineRow {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LeasePipelineRow>;
  const b = r.bucket;
  const bucket: ManagerLeaseBucket =
    b === "manager" || b === "admin" || b === "resident" || b === "signed" ? b : "manager";
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
  return {
    id,
    residentName: String(r.residentName ?? "").trim() || "—",
    residentEmail: String(r.residentEmail ?? "").trim(),
    unit: String(r.unit ?? "").trim() || "—",
    stageLabel: String(r.stageLabel ?? "").trim() || stageLabelForBucket(bucket),
    updated: String(r.updated ?? "").trim() || "—",
    bucket,
    pdfVersion: typeof r.pdfVersion === "number" && Number.isFinite(r.pdfVersion) ? Math.max(0, Math.floor(r.pdfVersion)) : 1,
    notes: typeof r.notes === "string" ? r.notes : String(r.notes ?? ""),
    updatedAtIso: typeof r.updatedAtIso === "string" && r.updatedAtIso.trim() ? r.updatedAtIso : isoFallback,
    axisId: typeof r.axisId === "string" ? r.axisId : undefined,
    application: r.application,
    generatedHtml: r.generatedHtml ?? null,
    generatedAtIso: r.generatedAtIso ?? null,
    managerUploadedPdf: r.managerUploadedPdf ?? null,
    thread: safeThread,
    signatureName: typeof r.signatureName === "string" ? r.signatureName : null,
    signedAtIso: typeof r.signedAtIso === "string" ? r.signedAtIso : null,
  };
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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
      return "With resident";
    case "signed":
      return "Signed";
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

function demoRowToPipeline(seed: DemoManagerLeaseDraftRow): LeasePipelineRow {
  const email = DEMO_RESIDENT_EMAIL[seed.id] ?? "";
  const apps = readManagerApplicationRows();
  const appId = DEMO_APPLICATION_IDS[seed.id];
  const appRow = appId ? apps.find((a) => a.id === appId) : apps.find((a) => a.email?.toLowerCase() === email.toLowerCase());
  const application = appRow ? effectiveApplicationForRow(appRow) : undefined;

  return normalizeLeasePipelineRow({
    id: seed.id,
    residentName: seed.resident,
    residentEmail: email,
    unit: seed.unit,
    stageLabel: seed.stageLabel,
    updated: seed.updated,
    bucket: seed.bucket,
    pdfVersion: Number.parseInt(String(seed.pdfVersion).replace(/\D/g, ""), 10) || 1,
    notes: String(seed.notes ?? ""),
    updatedAtIso: new Date().toISOString(),
    axisId: appRow?.id,
    application,
    generatedHtml: null,
    generatedAtIso: null,
    managerUploadedPdf: null,
    thread: [],
  });
}

function readRaw(): LeasePipelineRow[] | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as LeasePipelineRow[]) : null;
  } catch {
    return null;
  }
}

function write(rows: LeasePipelineRow[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    emit();
  } catch {
    /* quota */
  }
}

function syncApprovedApplications(rows: LeasePipelineRow[]): LeasePipelineRow[] {
  const apps = readManagerApplicationRows().filter((a) => a.bucket === "approved" && a.email?.trim());
  let next = [...rows];
  for (const app of apps) {
    const email = app.email!.trim().toLowerCase();
    const exists = next.some(
      (r) => r.axisId === app.id || r.residentEmail.toLowerCase() === email,
    );
    if (exists) continue;
    const unit = app.property?.trim() || "—";
    const iso = new Date().toISOString();
    next.push(
      normalizeLeasePipelineRow({
        id: `lease_app_${app.id}`,
        residentName: String(app.name ?? "").trim() || "Applicant",
        residentEmail: email,
        unit,
        stageLabel: stageLabelForBucket("manager"),
        updated: formatUpdatedLabel(iso),
        bucket: "manager",
        pdfVersion: 1,
        notes: "Created from approved application.",
        updatedAtIso: iso,
        axisId: app.id,
        application: effectiveApplicationForRow(app),
        generatedHtml: null,
        generatedAtIso: null,
        managerUploadedPdf: null,
        thread: [],
      }),
    );
  }
  return next;
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
      unit: app.property || r.unit,
      application: effectiveApplicationForRow(app),
      residentName: app.name || r.residentName,
    };
  });
}

export function readLeasePipeline(): LeasePipelineRow[] {
  try {
    let stored = readRaw() ?? [];
    stored = stored.map(normalizeLeasePipelineRow);
    if (stored.length === 0) {
      stored = demoManagerLeaseDraftRows.map(demoRowToPipeline);
    }
    const rows = enrichFromApplications(stored);
    const merged = syncApprovedApplications(rows);
    if (merged.length > stored.length) {
      return merged;
    }
    return rows;
  } catch {
    /* Corrupt lease pipeline JSON or unexpected shape — reset to empty pipeline. */
    try {
      if (canUseStorage()) window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return [];
  }
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

export function findLeaseForResidentEmail(email: string): LeasePipelineRow | null {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  return readLeasePipeline().find((r) => r.residentEmail.toLowerCase() === e) ?? null;
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
  const nextRow: LeasePipelineRow = {
    ...cur,
    ...patch,
    updatedAtIso: patch.updatedAtIso ?? iso,
    updated: patch.updated ?? formatUpdatedLabel(patch.updatedAtIso ?? iso),
  };
  if (patch.bucket && !patch.stageLabel) {
    nextRow.stageLabel = stageLabelForBucket(patch.bucket);
  }
  const next = [...rows];
  next[idx] = nextRow;
  write(next);
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
  const version = row.pdfVersion + 1;
  const ok = updateLeasePipelineRow(rowId, {
    generatedHtml: html,
    generatedAtIso: new Date().toISOString(),
    pdfVersion: version,
    notes: row.notes,
  });
  return ok ? { ok: true, version } : { ok: false, error: "Could not save generated lease." };
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
  const residentOwn = row.residentEmail ? readUploadedOwnLease(row.residentEmail) : null;
  if (residentOwn?.dataUrl) {
    const a = document.createElement("a");
    a.href = residentOwn.dataUrl;
    a.download = residentOwn.fileName || "lease.pdf";
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
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const payload = {
        dataUrl,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      };
      saveUploadedOwnLease(row.residentEmail, payload);
      const iso = new Date().toISOString();
      updateLeasePipelineRow(rowId, {
        managerUploadedPdf: payload,
        pdfVersion: row.pdfVersion + 1,
        updatedAtIso: iso,
        updated: formatUpdatedLabel(iso),
      });
      resolve({ ok: true });
    };
    reader.onerror = () => resolve({ ok: false, error: "Could not read file." });
    reader.readAsDataURL(file);
  });
}

/** Resident electronically signs — moves lease to signed (no separate manager "mark signed"). */
export function residentSignLease(email: string, signatureName?: string): boolean {
  const rows = readLeasePipeline();
  const idx = rows.findIndex((r) => r.residentEmail.toLowerCase() === email.trim().toLowerCase());
  if (idx === -1) return false;
  const row = rows[idx]!;
  if (row.bucket !== "resident") return false;
  const iso = new Date().toISOString();
  const sigMsg = signatureName ? `Signed electronically — ${signatureName}.` : "Signed electronically.";
  const thread = [...(row.thread ?? []), makeMsg("resident", sigMsg)];
  rows[idx] = {
    ...row,
    bucket: "signed",
    stageLabel: stageLabelForBucket("signed"),
    thread,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
    notes: row.notes,
    signatureName: signatureName ?? null,
    signedAtIso: iso,
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
  const html = row.generatedHtml;
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
    stageLabel: stageLabelForBucket("manager"),
    thread,
    updatedAtIso: iso,
    updated: formatUpdatedLabel(iso),
  };
  write(rows);
  return true;
}
