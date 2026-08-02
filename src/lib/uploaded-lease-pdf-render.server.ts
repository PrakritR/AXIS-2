import "server-only";

import { definePDFJSModule, getDocumentProxy, renderPageAsImage } from "unpdf";

const MAX_RENDERED_PAGES = 48;

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? (dataUrl.split(",")[1] ?? "") : dataUrl;
  const binary = Buffer.from(base64, "base64");
  return new Uint8Array(binary);
}

let pdfJsReady: Promise<void> | null = null;

async function ensurePdfJs(): Promise<void> {
  if (!pdfJsReady) {
    pdfJsReady = definePDFJSModule(() => import("unpdf/pdfjs"));
  }
  await pdfJsReady;
}

/** Rasterize an uploaded lease PDF into page image data URLs (server-only). */
export async function renderUploadedLeasePdfPages(
  dataUrl: string,
): Promise<{ pages: string[]; totalPages: number }> {
  await ensurePdfJs();
  const pdf = await getDocumentProxy(dataUrlToUint8Array(dataUrl));
  const totalPages = pdf.numPages;
  const limit = Math.min(totalPages, MAX_RENDERED_PAGES);
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
    const rendered = await renderPageAsImage(pdf, pageNumber, {
      scale: 1.35,
      toDataURL: true,
    });
    pages.push(typeof rendered === "string" ? rendered : "");
  }
  return { pages, totalPages };
}
