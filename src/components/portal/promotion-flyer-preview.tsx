"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { buildFlyerHtml, type ManagerPromotionRow } from "@/lib/promotion-flyer";

/** Save the promotion's standalone flyer document as an .html download. */
export function downloadPromotionFlyer(promotion: ManagerPromotionRow) {
  const html = buildFlyerHtml(promotion);
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

/**
 * Flyer preview. The flyer is rendered inside an isolated <iframe> (its own
 * <style>, unaffected by the app theme) so what the manager sees is exactly
 * what prints.
 *
 * Two modes:
 * - `embedded` — inline panel (used in the expanded promotion table row); the
 *   iframe scrolls internally when the flyer is taller than the panel.
 * - default — full-screen modal with Print / Save-as-PDF (drives the iframe's
 *   own print dialog) and Download (saves the standalone HTML document).
 */
export function PromotionFlyerPreview({
  promotion,
  onClose,
  embedded = false,
}: {
  promotion: ManagerPromotionRow;
  onClose?: () => void;
  embedded?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => buildFlyerHtml(promotion), [promotion]);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  useEffect(() => {
    if (embedded || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded, onClose]);

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  if (embedded) {
    return (
      <div className="max-h-[min(60vh,480px)] min-w-0 w-full max-w-full overflow-auto rounded-xl border border-border bg-white shadow-sm sm:max-h-[620px] [html[data-native]_&]:max-h-[52vh]">
        <iframe
          ref={iframeRef}
          title={`Flyer — ${promotion.title || promotion.propertyLabel || "promotion"}`}
          sandbox="allow-same-origin"
          className="block h-[min(60vh,480px)] min-h-[360px] w-full min-w-[280px] border-0 sm:h-[620px] [html[data-native]_&]:h-[52vh]"
        />
      </div>
    );
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
              onClick={() => downloadPromotionFlyer(promotion)}
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
            sandbox="allow-same-origin allow-modals"
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
