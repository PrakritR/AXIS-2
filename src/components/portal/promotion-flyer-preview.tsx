"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { buildFlyerHtml, type ManagerPromotionRow } from "@/lib/promotion-flyer";

/**
 * Full-screen flyer preview. The flyer is rendered inside an isolated <iframe>
 * (its own <style>, unaffected by the app theme) so what the manager sees is
 * exactly what prints. Print / Save-as-PDF drives the iframe's own print dialog;
 * Download saves the standalone HTML document.
 */
export function PromotionFlyerPreview({
  promotion,
  onClose,
}: {
  promotion: ManagerPromotionRow;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => buildFlyerHtml(promotion), [promotion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  function handleDownload() {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = (promotion.title || "flyer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    a.href = url;
    a.download = `${slug || "flyer"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Flyer preview"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 pb-3">
          <p className="truncate text-sm font-semibold text-white">{promotion.title || "Flyer preview"}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 text-xs"
              onClick={handleDownload}
              data-attr="promotion-flyer-download"
            >
              Download
            </Button>
            <Button
              type="button"
              className="h-9 text-xs"
              onClick={handlePrint}
              event="flyer_printed"
              data-attr="promotion-flyer-print"
            >
              Print / Save PDF
            </Button>
            <Button type="button" variant="outline" className="h-9 text-xs" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-white shadow-2xl">
          <iframe
            ref={iframeRef}
            title="Flyer preview"
            srcDoc={html}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
