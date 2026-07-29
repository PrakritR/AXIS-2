"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal";
import { downloadOrShareFile } from "@/lib/native/download-or-share";
import { buildFlyerHtml, type ManagerPromotionRow } from "@/lib/promotion-flyer";
import { computeFlyerFit, type FlyerFit } from "@/lib/promotion-flyer-fit";

/**
 * Save the promotion's standalone flyer document. Web: `.html` download.
 * Native shell: system share sheet (Save to Files / AirDrop / …) — a synthetic
 * `<a download>` on a blob URL does nothing in WKWebView.
 */
export async function downloadPromotionFlyer(promotion: ManagerPromotionRow): Promise<void> {
  const html = buildFlyerHtml(promotion);
  const slug = (promotion.title || "flyer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  await downloadOrShareFile({
    fileName: `${slug || "flyer"}.html`,
    mimeType: "text/html",
    content: html,
    title: promotion.title || "Flyer",
  });
}

/**
 * Writes the flyer document into the iframe and keeps a scale-to-fit transform
 * in sync with the container width. The iframe is laid out at the sheet's
 * natural print width and scaled down, so the surrounding container (not the
 * iframe document) owns scrolling — iframe-internal touch scrolling is
 * unreliable in iOS WKWebView.
 */
function useFlyerFit(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  scrollRef: RefObject<HTMLDivElement | null>,
  html: string,
): FlyerFit | null {
  const [fit, setFit] = useState<FlyerFit | null>(null);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [iframeRef, html]);

  useEffect(() => {
    const frame = iframeRef.current;
    const scroller = scrollRef.current;
    if (!frame || !scroller) return;

    const measure = () => {
      const sheet = frame.contentDocument?.querySelector<HTMLElement>(".sheet");
      if (!sheet) return;
      setFit(computeFlyerFit(scroller.clientWidth, sheet.offsetWidth, sheet.offsetHeight));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    // Same-origin iframe doc — re-measure when embedded images finish decoding.
    const docEl = frame.contentDocument?.documentElement;
    if (docEl) observer.observe(docEl);
    return () => observer.disconnect();
  }, [iframeRef, scrollRef, html]);

  return fit;
}

/** The scaled iframe inside a spacer sized to the on-screen flyer box. */
function FlyerFrame({
  iframeRef,
  fit,
  title,
  sandbox,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  fit: FlyerFit | null;
  title: string;
  sandbox: string;
}) {
  return (
    <div
      className="overflow-hidden"
      style={fit ? { width: "100%", height: fit.scaledHeight } : undefined}
    >
      <iframe
        ref={iframeRef}
        title={title}
        sandbox={sandbox}
        className={fit ? "block max-w-none border-0" : "block min-h-[360px] w-full border-0"}
        style={
          fit
            ? {
                width: fit.sheetWidth,
                height: fit.sheetHeight,
                transform: `scale(${fit.scale})`,
                transformOrigin: "top left",
              }
            : undefined
        }
      />
    </div>
  );
}

const FLYER_SCROLLER_CLASS =
  "overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]";

/**
 * Flyer preview. The flyer is rendered inside an isolated <iframe> (its own
 * <style>, unaffected by the app theme) so what the manager sees is exactly
 * what prints. The iframe is scaled to fit the container width (print intent
 * preserved) and the container scrolls vertically.
 *
 * Two modes:
 * - `embedded` — inline panel (used in the expanded promotion table row).
 * - default — full-screen modal with Print / Save-as-PDF (drives the iframe's
 *   own print dialog) and Download (saves/shares the standalone HTML document).
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => buildFlyerHtml(promotion), [promotion]);
  const fit = useFlyerFit(iframeRef, scrollRef, html);

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  if (embedded) {
    return (
      <div
        ref={scrollRef}
        className={`max-h-[min(60vh,480px)] min-w-0 w-full max-w-full rounded-xl border border-border bg-white shadow-sm sm:max-h-[620px] [html[data-native]_&]:max-h-[52vh] ${FLYER_SCROLLER_CLASS}`}
      >
        <FlyerFrame
          iframeRef={iframeRef}
          fit={fit}
          title={`Flyer · ${promotion.title || promotion.propertyLabel || "promotion"}`}
          sandbox="allow-same-origin"
        />
      </div>
    );
  }

  if (!onClose) return null;

  return (
    <ModalShell
      open
      onClose={onClose}
      presentation="dialog"
      stackClassName="fixed inset-0 z-[200] flex flex-col"
      overlayClassName="fixed inset-0 bg-black/60 backdrop-blur-sm"
      centerClassName="mx-auto flex h-full w-full max-w-3xl flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      panelClassName="flex h-full w-full flex-col outline-none"
      ariaLabel="Flyer preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <p className="min-w-0 truncate text-sm font-semibold text-white">{promotion.title || "Flyer preview"}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 text-xs"
            onClick={() => void downloadPromotionFlyer(promotion)}
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
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 rounded-xl bg-white shadow-2xl ${FLYER_SCROLLER_CLASS}`}
      >
        <FlyerFrame
          iframeRef={iframeRef}
          fit={fit}
          title="Flyer preview"
          sandbox="allow-same-origin allow-modals"
        />
      </div>
    </ModalShell>
  );
}
