import "server-only";

import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import {
  buildUploadedLeaseParse,
  failedUploadedLeaseParse,
  type UploadedLeaseParse,
} from "@/lib/uploaded-lease-extraction";

/**
 * Text extraction for a manager-uploaded lease PDF.
 *
 * Pages are kept SEPARATE (`mergePages` off) because every extracted field and
 * section records the page it came from, and a reviewer with no page number
 * cannot check the machine's work — which would make the confirm step theatre.
 *
 * `unpdf` is already a dependency (`lease-pdf-parse.server.ts`) and this module
 * is `server-only`, so it adds nothing to the client bundle. Nothing here leaves
 * the process: field extraction is deterministic regex in
 * `uploaded-lease-extraction.ts`, and no lease text is sent to any third-party
 * service.
 */
export async function extractLeasePdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf);
  if (Array.isArray(text)) return text.map((page) => String(page ?? ""));
  return [String(text ?? "")];
}

export function dataUrlToPdfBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Parse uploaded PDF bytes into PropLane's lease structure.
 *
 * Never throws for a document-shaped problem: an unreadable or oversized PDF
 * comes back as a `failed` parse carrying the reason, because a failure still
 * has to keep the confirm-before-sign gate closed rather than disappear.
 */
export async function parseUploadedLeasePdfBytes(args: {
  bytes: Uint8Array;
  fileName: string;
  nowIso?: string;
}): Promise<UploadedLeaseParse> {
  const sourceSha256 = createHash("sha256").update(Buffer.from(args.bytes)).digest("hex");
  let pages: string[];
  try {
    pages = await extractLeasePdfPages(args.bytes);
  } catch {
    return {
      ...failedUploadedLeaseParse(
        args.fileName,
        "This file could not be opened as a PDF. Review the original document instead.",
      ),
      sourceSha256,
    };
  }
  const parsed = buildUploadedLeaseParse({
    pages,
    fileName: args.fileName,
    sourceSha256,
    extractedAtIso: args.nowIso ?? new Date().toISOString(),
  });
  return { ...parsed, sourceSha256 };
}
