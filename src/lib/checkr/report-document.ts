/**
 * Fetch the official Checkr Tenant PDF report (the same document as Download PDF
 * in tenant.checkr.com). Never expose the Checkr secret key or raw S3 URLs to
 * the browser — proxy bytes through `/api/screening/background-check/document`.
 */
import { checkrApiKey, checkrSimulate } from "@/lib/checkr/config";

type CheckrFetch = (path: string, init?: RequestInit) => Promise<Response>;

function extractReportResourceId(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  const top = typeof raw.id === "string" ? raw.id.trim() : "";
  if (top.startsWith("rp_")) return top;
  const nested = raw.report;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const id = (nested as { id?: string }).id;
    if (typeof id === "string" && id.startsWith("rp_")) return id.trim();
  }
  return null;
}

function extractPdfDownloadUri(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of ["pdf_url", "pdf_uri", "download_uri", "download_url"] as const) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const documents = obj.documents;
  if (Array.isArray(documents)) {
    for (const doc of documents) {
      if (!doc || typeof doc !== "object") continue;
      const row = doc as { type?: string; download_uri?: string; download_url?: string };
      if (row.type === "pdf_report" || row.type === "report_pdf") {
        const uri = row.download_uri ?? row.download_url;
        if (typeof uri === "string" && uri.trim()) return uri.trim();
      }
    }
  }
  return null;
}

async function fetchPdfBytesFromUrl(url: string): Promise<ArrayBuffer | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("pdf") && !type.includes("octet-stream")) return null;
  return res.arrayBuffer();
}

/** Parse report resource id (`rp_…`) from GET /orders/{id}/report JSON. */
export function parseCheckrReportResourceId(raw: Record<string, unknown> | null): string | null {
  return extractReportResourceId(raw);
}

/** Download official Checkr Tenant PDF bytes for an order / report resource. */
export async function fetchCheckrReportPdfBytes(
  checkrFetch: CheckrFetch,
  opts: { orderId: string; reportResourceId?: string | null },
): Promise<ArrayBuffer | null> {
  if (checkrSimulate() && !checkrApiKey()) return null;

  let reportResourceId = opts.reportResourceId?.trim() || null;
  if (!reportResourceId) {
    const orderReportRes = await checkrFetch(`/orders/${encodeURIComponent(opts.orderId)}/report`);
    if (orderReportRes.ok) {
      const raw = (await orderReportRes.json()) as Record<string, unknown>;
      reportResourceId = extractReportResourceId(raw);
      const directUri = extractPdfDownloadUri(raw);
      if (directUri) {
        const bytes = await fetchPdfBytesFromUrl(directUri);
        if (bytes) return bytes;
      }
    }
  }

  if (!reportResourceId) return null;

  const pdfPathRes = await checkrFetch(`/reports/${encodeURIComponent(reportResourceId)}/pdf`, {
    headers: { Accept: "application/pdf" },
  });
  if (pdfPathRes.ok) {
    const type = pdfPathRes.headers.get("content-type") ?? "";
    if (type.includes("pdf") || type.includes("octet-stream")) {
      return pdfPathRes.arrayBuffer();
    }
  }

  const reportRes = await checkrFetch(
    `/reports/${encodeURIComponent(reportResourceId)}?include=documents`,
  );
  if (!reportRes.ok) {
    const reportPlain = await checkrFetch(`/reports/${encodeURIComponent(reportResourceId)}`);
    if (!reportPlain.ok) return null;
    const payload = (await reportPlain.json()) as Record<string, unknown>;
    const uri = extractPdfDownloadUri(payload);
    return uri ? fetchPdfBytesFromUrl(uri) : null;
  }

  const payload = (await reportRes.json()) as Record<string, unknown>;
  const uri = extractPdfDownloadUri(payload);
  if (!uri) return null;
  return fetchPdfBytesFromUrl(uri);
}
