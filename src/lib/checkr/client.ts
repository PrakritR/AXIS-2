/**
 * Server-side Checkr API client. Runs a criminal background check for a rental
 * applicant: create candidate → create report → poll report.
 *
 * Security:
 *  - The secret key is used ONLY here, server-side, as the HTTP Basic-auth
 *    username. It is never returned to callers, never put in an error message,
 *    and never logged.
 *  - All applicant PII is assembled and sent from the server; nothing about the
 *    request is exposed to the browser.
 *
 * Async model: Checkr reports complete asynchronously (usually minutes in
 * staging). We support status polling; a webhook receiver
 * (`/api/webhooks/screening/checkr`) can push completions instead — preferred
 * once instant propagation matters.
 */
import {
  checkrApiBaseUrl,
  checkrApiKey,
  checkrPackageSlug,
  checkrSimulate,
} from "@/lib/checkr/config";
import type {
  CheckrCandidateInput,
  CheckrCreateResult,
  CheckrReport,
  CheckrReportStatus,
  CheckrResult,
} from "@/lib/checkr/types";

function authHeader(): string {
  const key = checkrApiKey();
  if (!key) throw new Error("Checkr is not configured (missing CHECKR_API_KEY).");
  // Basic auth: secret key as username, empty password → base64("key:").
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

async function checkrFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${checkrApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/** Extract a human-safe error message without ever echoing credentials. */
async function readError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const raw =
    (Array.isArray(payload?.error) && payload?.error.join(", ")) ||
    (typeof payload?.error === "string" && payload.error) ||
    (typeof payload?.message === "string" && payload.message) ||
    "";
  return raw ? `Checkr: ${raw}` : `${fallback} (${response.status}).`;
}

function normalizeStatus(value: unknown): CheckrReportStatus {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s === "complete" || s === "completed") return "complete";
  if (s === "suspended") return "suspended";
  if (s === "dispute") return "dispute";
  if (s === "canceled" || s === "cancelled") return "canceled";
  return "pending";
}

function normalizeResult(value: unknown): CheckrResult {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (s === "clear") return "clear";
  if (s === "consider") return "consider";
  return null;
}

// ---------------------------------------------------------------------------
// Simulate fallback — deterministic, no network. Lets the flow be exercised on
// localhost without a live key or Checkr's exact mocked candidate data.
// Rule: odd final SSN digit → "consider", otherwise → "clear".
// ---------------------------------------------------------------------------

function stableHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function simulatedResult(ssn: string): CheckrResult {
  const digits = ssn.replace(/\D/g, "");
  const last = digits.length ? Number(digits[digits.length - 1]) : 0;
  return last % 2 === 1 ? "consider" : "clear";
}

/** Create a candidate and kick off a report. Returns identifiers + initial status. */
export async function createBackgroundCheck(input: CheckrCandidateInput): Promise<CheckrCreateResult> {
  const packageSlug = (await resolvePackageSlug()) ?? "test_pro_criminal";

  if (checkrSimulate() && !checkrApiKey()) {
    const seed = stableHash(`${input.email}:${input.ssn}`);
    return {
      candidateId: `test_cand_${seed}`,
      reportId: `test_rpt_${seed}`,
      packageSlug,
      status: "pending",
      result: null,
      simulated: true,
    };
  }

  // 1) Candidate
  const candidateRes = await checkrFetch("/candidates", {
    method: "POST",
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      ...(input.middleName ? { middle_name: input.middleName } : { no_middle_name: true }),
      email: input.email,
      dob: input.dob ?? undefined,
      ssn: input.ssn || undefined,
      zipcode: input.zipcode || undefined,
      phone: input.phone || undefined,
    }),
  });
  if (!candidateRes.ok) throw new Error(await readError(candidateRes, "Failed to create candidate"));
  const candidate = (await candidateRes.json()) as { id?: string };
  const candidateId = candidate.id;
  if (!candidateId) throw new Error("Checkr did not return a candidate id.");

  // 2) Report (self-hosted: manager already collected applicant consent).
  const reportRes = await checkrFetch("/reports", {
    method: "POST",
    body: JSON.stringify({ candidate_id: candidateId, package: packageSlug }),
  });
  if (!reportRes.ok) throw new Error(await readError(reportRes, "Failed to create report"));
  const report = (await reportRes.json()) as {
    id?: string;
    status?: string;
    result?: string;
    assessment?: string;
  };
  if (!report.id) throw new Error("Checkr did not return a report id.");

  return {
    candidateId,
    reportId: report.id,
    packageSlug,
    status: normalizeStatus(report.status),
    result: normalizeResult(report.result),
    assessment: typeof report.assessment === "string" ? report.assessment : null,
    simulated: false,
  };
}

/** Fetch the current state of a report. */
export async function fetchBackgroundCheckReport(
  reportId: string,
  opts?: { ssn?: string },
): Promise<CheckrReport | null> {
  if (checkrSimulate() && !checkrApiKey()) {
    // Simulate completes on first poll so the status transition is observable.
    return {
      reportId,
      status: "complete",
      result: simulatedResult(opts?.ssn ?? reportId),
      assessment: null,
      simulated: true,
    };
  }

  const res = await checkrFetch(`/reports/${encodeURIComponent(reportId)}`);
  if (!res.ok) return null;
  const report = (await res.json()) as {
    id?: string;
    status?: string;
    result?: string;
    assessment?: string;
  };
  if (!report.id) return null;
  return {
    reportId: report.id,
    status: normalizeStatus(report.status),
    result: normalizeResult(report.result),
    assessment: typeof report.assessment === "string" ? report.assessment : null,
  };
}

// Package resolution is cached for the process lifetime — packages rarely change.
let cachedPackageSlug: string | null | undefined;

/**
 * Resolve which package to run: the pinned `CHECKR_PACKAGE`, else the first
 * package on the account. Returns null if neither is available (caller falls
 * back to a sensible default).
 */
export async function resolvePackageSlug(): Promise<string | null> {
  const pinned = checkrPackageSlug();
  if (pinned) return pinned;
  if (cachedPackageSlug !== undefined) return cachedPackageSlug;
  if (checkrSimulate() && !checkrApiKey()) {
    cachedPackageSlug = "test_pro_criminal";
    return cachedPackageSlug;
  }
  try {
    const res = await checkrFetch("/packages");
    if (!res.ok) {
      cachedPackageSlug = null;
      return null;
    }
    const body = (await res.json()) as { data?: Array<{ slug?: string }> };
    const slug = body.data?.find((p) => typeof p.slug === "string" && p.slug)?.slug ?? null;
    cachedPackageSlug = slug;
    return slug;
  } catch {
    cachedPackageSlug = null;
    return null;
  }
}
