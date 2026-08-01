"use client";

import { useEffect, useState } from "react";

const MAX_RENDERED_PAGES = 48;

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? (dataUrl.split(",")[1] ?? "") : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function renderUploadedPdfPages(dataUrl: string): Promise<{ pages: string[]; totalPages: number }> {
  const { definePDFJSModule, getDocumentProxy, renderPageAsImage } = await import("unpdf");
  await definePDFJSModule(() => import("unpdf/pdfjs"));
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

/**
 * Scrollable preview for manager- or resident-uploaded lease PDFs.
 * Embedded PDF iframes only show the first page on iOS WKWebView, so pages
 * are rasterized for a vertically scrollable stack instead.
 */
export function UploadedLeasePdfPreview({
  dataUrl,
  title,
  fileName,
  className,
  embeddedInFlex = false,
}: {
  dataUrl: string;
  title: string;
  fileName?: string;
  className?: string;
  /** When true, grows inside a flex parent (manager resident lease tab). */
  embeddedInFlex?: boolean;
}) {
  const [pages, setPages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);
    setTotalPages(0);
    void renderUploadedPdfPages(dataUrl)
      .then((result) => {
        if (cancelled) return;
        setPages(result.pages);
        setTotalPages(result.totalPages);
      })
      .catch(() => {
        if (!cancelled) setError("Could not render this PDF in the preview.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  const scrollClass = embeddedInFlex
    ? "min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
    : "max-h-[min(80dvh,900px)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]";

  return (
    <div className={className}>
      <div className="border-b border-border bg-card px-3 py-2 text-xs">
        <a
          href={dataUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Open full document{fileName ? ` — ${fileName}` : ""}
        </a>
        {totalPages > 1 ? (
          <span className="ml-2 text-muted">
            · {totalPages} page{totalPages === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <div className={scrollClass}>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Loading lease pages…</p>
        ) : error ? (
          <div className="space-y-2 px-4 py-8 text-center text-sm text-muted">
            <p>{error}</p>
            <p>Use Open full document above to view the complete file.</p>
          </div>
        ) : (
          <div className="space-y-2 bg-white p-2">
            {pages.map((src, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${title}-page-${index + 1}`}
                src={src}
                alt={`${title} — page ${index + 1}`}
                className="block w-full rounded border border-border/60 bg-white"
              />
            ))}
            {totalPages > pages.length ? (
              <p className="px-2 py-3 text-center text-xs text-muted">
                Preview shows the first {pages.length} pages. Open the full document to read the rest.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
