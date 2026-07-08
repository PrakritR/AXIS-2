/**
 * Checkr Tenant PDF bytes for offline simulate fallbacks and the unauthenticated
 * `/demo` document route. Authenticated routes may still fetch live sandbox PDFs;
 * unauthenticated demo handlers must use {@link loadCheckrStaticSampleReportPdfBytes} only.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkrApiFetch } from "@/lib/checkr/client";
import { checkrApiKey } from "@/lib/checkr/config";
import { fetchCheckrReportPdfBytes } from "@/lib/checkr/report-document";

const SAMPLE_PDF_PATH = join(process.cwd(), "public/samples/checkr-tenant-report.pdf");

/** Minimal valid PDF used when the committed sample file is absent. */
const EMBEDDED_MINIMAL_SAMPLE_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
149
%%EOF`,
);

/** Restrict Content-Disposition filename segments to safe characters. */
export function sanitizeCheckrReportApplicationId(raw: string | null | undefined): string {
  const sanitized = (raw?.trim() ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return sanitized || "demo";
}

export function checkrSampleOrderId(): string | null {
  return process.env.CHECKR_SAMPLE_ORDER_ID?.trim() || null;
}

export function checkrSampleReportResourceId(): string | null {
  return process.env.CHECKR_SAMPLE_REPORT_RESOURCE_ID?.trim() || null;
}

/** Load the committed static sample PDF only — safe for unauthenticated demo routes. */
export async function loadCheckrStaticSampleReportPdfBytes(): Promise<ArrayBuffer> {
  try {
    const buf = await readFile(SAMPLE_PDF_PATH);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return EMBEDDED_MINIMAL_SAMPLE_PDF.buffer.slice(
      EMBEDDED_MINIMAL_SAMPLE_PDF.byteOffset,
      EMBEDDED_MINIMAL_SAMPLE_PDF.byteOffset + EMBEDDED_MINIMAL_SAMPLE_PDF.byteLength,
    );
  }
}

/** Load the Checkr sample report PDF (sandbox API first, then committed static file). */
export async function loadCheckrSampleReportPdfBytes(): Promise<ArrayBuffer | null> {
  const orderId = checkrSampleOrderId();
  const reportResourceId = checkrSampleReportResourceId();

  if (checkrApiKey() && (orderId || reportResourceId)) {
    const bytes = await fetchCheckrReportPdfBytes(checkrApiFetch, {
      orderId: orderId ?? reportResourceId ?? "",
      reportResourceId,
    });
    if (bytes) return bytes;
  }

  try {
    return await loadCheckrStaticSampleReportPdfBytes();
  } catch {
    return null;
  }
}
