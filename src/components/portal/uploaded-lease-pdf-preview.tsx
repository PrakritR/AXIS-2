"use client";

import { useEffect, useState } from "react";

const MAX_RENDERED_PAGES = 48;
/** Cap the raster edge so a phone never allocates a canvas iOS will silently blank. */
const MAX_CANVAS_EDGE = 2000;
const BASE_RENDER_SCALE = 1.5;

function prefersRasterPreview(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios || document.documentElement.hasAttribute("data-native");
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? (dataUrl.split(",")[1] ?? "") : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Yield to the event loop so main-thread page rendering cannot lock up the UI. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Rasterize a PDF to page images in the BROWSER.
 *
 * iOS WKWebView (and therefore the Capacitor shell) does not render PDFs inside
 * an iframe/embed/object, so the native app needs real pixels. pdf.js ships
 * inside `unpdf`, which we already depend on for server-side PDF work, and its
 * bundle carries the worker inline — so it runs with no separate worker asset
 * and no new dependency. It is imported dynamically, so the ~1.6 MB minified
 * chunk is fetched only when a lease PDF preview actually mounts.
 *
 * Each page is drawn into ONE reused canvas and immediately flattened to a JPEG
 * data URL: keeping 48 live canvases would blow past the per-tab canvas memory
 * limit on a phone, whereas decoded <img> elements can be evicted by the browser.
 */
async function renderPdfPagesInBrowser(
  dataUrl: string,
  onPage: (page: string, totalPages: number) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const pdfjs = await import("unpdf/pdfjs");
  if (isCancelled()) return;

  const source = dataUrl.startsWith("data:") ? { data: dataUrlToBytes(dataUrl) } : { url: dataUrl };
  const loadingTask = pdfjs.getDocument({ ...source, disableAutoFetch: true });

  try {
    const pdf = await loadingTask.promise;
    if (isCancelled()) return;

    const totalPages = pdf.numPages;
    const limit = Math.min(totalPages, MAX_RENDERED_PAGES);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable.");

    for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
      if (isCancelled()) return;
      const page = await pdf.getPage(pageNumber);
      try {
        const base = page.getViewport({ scale: 1 });
        const density = Math.min(window.devicePixelRatio || 1, 2);
        const wanted = BASE_RENDER_SCALE * density;
        const fit = MAX_CANVAS_EDGE / Math.max(base.width, base.height);
        const viewport = page.getViewport({ scale: Math.min(wanted, fit) });

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        // PDF pages are transparent; without this text renders onto black in JPEG.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (isCancelled()) return;

        onPage(canvas.toDataURL("image/jpeg", 0.85), totalPages);
      } finally {
        page.cleanup();
      }
      await yieldToBrowser();
    }

    canvas.width = 0;
    canvas.height = 0;
  } finally {
    void loadingTask.destroy().catch(() => {});
  }
}

/**
 * Scrollable preview for manager- or resident-uploaded lease PDFs.
 * Desktop keeps the browser's own embedded PDF viewer; iOS / native WebViews
 * rasterize pages in-page because those engines do not render embedded PDFs.
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
  embeddedInFlex?: boolean;
}) {
  const [useRaster, setUseRaster] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUseRaster(prefersRasterPreview());
  }, []);

  useEffect(() => {
    if (!useRaster) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    setLoading(true);
    setError(null);
    setPages([]);
    setTotalPages(0);
    void renderPdfPagesInBrowser(
      dataUrl,
      (page, count) => {
        if (cancelled) return;
        // Show each page as it finishes rather than blocking on the whole document.
        setTotalPages(count);
        setPages((prev) => [...prev, page]);
        setLoading(false);
      },
      isCancelled,
    )
      .catch(() => {
        if (!cancelled) setError("Could not render this PDF in the preview.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataUrl, useRaster]);

  const scrollClass = embeddedInFlex
    ? "min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
    : "max-h-[min(80dvh,900px)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]";

  const header = (
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
  );

  if (!useRaster) {
    return (
      <div className={className}>
        {header}
        <iframe
          title={title}
          src={dataUrl}
          className={`block w-full border-0 bg-white ${embeddedInFlex ? "min-h-[70dvh] flex-1" : "min-h-[min(80dvh,900px)]"}`}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {header}
      <div className={scrollClass}>
        {error && !pages.length ? (
          <div className="space-y-2 px-4 py-8 text-center text-sm text-muted">
            <p>{error}</p>
            <p>Use Open full document above to view the complete file.</p>
          </div>
        ) : !pages.length && loading ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Loading lease pages…</p>
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
            {loading ? (
              <p className="px-2 py-3 text-center text-xs text-muted">Loading more pages…</p>
            ) : totalPages > pages.length ? (
              <p className="px-2 py-3 text-center text-xs text-muted">
                Preview shows the first {Math.min(pages.length, MAX_RENDERED_PAGES)} pages. Open the full
                document to read the rest.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
