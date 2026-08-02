"use client";

import { useEffect, useState } from "react";

const MAX_RENDERED_PAGES = 48;

function prefersRasterPreview(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios || document.documentElement.hasAttribute("data-native");
}

async function fetchRasterPages(dataUrl: string): Promise<{ pages: string[]; totalPages: number }> {
  const res = await fetch("/api/lease-pdf-preview-pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ dataUrl }),
  });
  const body = (await res.json().catch(() => null)) as
    | { pages?: string[]; totalPages?: number; error?: string }
    | null;
  if (!res.ok || !body?.pages) {
    throw new Error(body?.error ?? "Could not render PDF preview.");
  }
  return { pages: body.pages, totalPages: body.totalPages ?? body.pages.length };
}

/**
 * Scrollable preview for manager- or resident-uploaded lease PDFs.
 * Desktop uses an embedded PDF viewer; iOS / native WebViews rasterize pages
 * via a server route because embedded PDFs often show only the first page.
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
    setLoading(true);
    setError(null);
    setPages([]);
    setTotalPages(0);
    void fetchRasterPages(dataUrl)
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
