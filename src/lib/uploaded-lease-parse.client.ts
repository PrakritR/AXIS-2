/**
 * Browser side of "upload a lease, then read it into PropLane format".
 *
 * One function so both upload surfaces (the resident detail Lease tab and the
 * Leases pipeline) behave identically: store the PDF, structure it, store the
 * structure. The lease is held in review the whole time — `managerUploadLeasePdf`
 * writes the `pending` parse synchronously, so even a network failure here
 * leaves the lease unsignable rather than quietly signable.
 */

import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  managerUploadLeasePdf,
  readLeasePipeline,
  saveUploadedLeaseParse,
} from "@/lib/lease-pipeline-storage";
import {
  failedUploadedLeaseParse,
  normalizeUploadedLeaseParse,
  type UploadedLeaseParse,
} from "@/lib/uploaded-lease-extraction";

export async function parseUploadedLeaseDataUrl(args: {
  dataUrl: string;
  fileName: string;
}): Promise<UploadedLeaseParse> {
  const res = await fetch("/api/portal/parse-uploaded-lease", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ dataUrl: args.dataUrl, fileName: args.fileName }),
  });
  const payload = (await res.json().catch(() => ({}))) as { parse?: unknown; error?: string };
  if (!res.ok) throw new Error(payload.error ?? "Could not read that lease PDF.");
  const parse = normalizeUploadedLeaseParse(payload.parse);
  if (!parse) throw new Error("Could not read that lease PDF.");
  return parse;
}

export type UploadAndParseResult = {
  ok: boolean;
  error?: string;
  /** Null in demo mode, where no parse round trip runs. */
  parse?: UploadedLeaseParse | null;
};

/**
 * Upload the PDF onto a lease row and structure it in one step.
 *
 * A failed parse is RECORDED as a failed parse rather than dropped: the row
 * keeps its unconfirmed state (so signing stays blocked) and the manager sees
 * why, instead of a lease that silently looks ready.
 */
export async function uploadAndParseLeasePdf(
  rowId: string,
  file: File,
  managerUserId?: string | null,
): Promise<UploadAndParseResult> {
  const uploaded = await managerUploadLeasePdf(rowId, file, managerUserId);
  if (!uploaded.ok) return { ok: false, error: uploaded.error };
  if (isDemoModeActive()) return { ok: true, parse: null };

  const row = readLeasePipeline(managerUserId).find((r) => r.id === rowId);
  const dataUrl = row?.managerUploadedPdf?.originalDataUrl ?? row?.managerUploadedPdf?.dataUrl ?? "";
  if (!dataUrl) return { ok: true, parse: null };

  let parse: UploadedLeaseParse;
  try {
    parse = await parseUploadedLeaseDataUrl({ dataUrl, fileName: file.name });
  } catch (err) {
    parse = failedUploadedLeaseParse(file.name, err instanceof Error ? err.message : "Could not read that lease PDF.");
  }
  const saved = saveUploadedLeaseParse(rowId, parse, managerUserId);
  if (!saved.ok) return { ok: true, parse, error: saved.error };
  return { ok: true, parse };
}
