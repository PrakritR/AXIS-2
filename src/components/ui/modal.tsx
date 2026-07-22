"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "@/hooks/use-is-client";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { lockPortalScroll } from "@/lib/native/lock-portal-scroll";
import { MODAL_PANEL_CLASS } from "@/components/ui/modal-styles";
import { usePortalContainer } from "@/components/ui/portal-container-context";
import { cn } from "@/lib/utils";

export { MODAL_INSET_BOX_CLASS, MODAL_INSET_BOX_PRE_CLASS, MODAL_PANEL_CLASS, MODAL_WARNING_BOX_CLASS, MODAL_FIELD_LABEL_CLASS } from "@/components/ui/modal-styles";

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  panelClassName,
  stackClassName,
  dense = false,
  busy = false,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Sticky footer below the scrollable body (action buttons, etc.). */
  footer?: ReactNode;
  /** Width / layout overrides merged onto the default glass panel shell. */
  panelClassName?: string;
  /** Override z-index stacking for nested modals (e.g. inside listing form overlay). */
  stackClassName?: string;
  /** Tighter header/body spacing for compact forms. */
  dense?: boolean;
  /**
   * An in-flight write owns the modal: backdrop click, the header Close button
   * and Escape all become inert. Without this a "cancel" only hides the shell —
   * the pending request still lands and reports success over a closed modal.
   */
  busy?: boolean;
}) {
  const isClient = useIsClient();
  const portalContainer = usePortalContainer();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);

  useEffect(() => {
    if (!open) return;
    return lockPortalScroll();
  }, [open]);

  useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || !isClient) return null;

  return createPortal(
    <div className={stackClassName ?? "fixed inset-0 z-[70] overflow-y-auto overscroll-contain"}>
      <button
        type="button"
        aria-label="Close"
        className="modal-overlay fixed inset-0"
        onClick={busy ? undefined : onClose}
        disabled={busy}
      />
      <div className="relative z-[71] flex min-h-full items-center justify-center px-2 py-4 sm:px-4 sm:py-6">
        <div
          ref={panelRef}
          className={cn(MODAL_PANEL_CLASS, "min-h-0", panelClassName)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            className={cn(
              "flex shrink-0 items-start justify-between border-b border-border",
              dense ? "gap-2 pb-2" : "gap-4 pb-4",
            )}
          >
            <h3
              id="modal-title"
              className={cn("min-w-0 font-semibold text-foreground", dense ? "text-base" : "text-lg")}
            >
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={cn(
                "shrink-0 rounded-full border border-border bg-card font-semibold text-muted hover:bg-foreground/5",
                dense ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
                busy && "cursor-not-allowed opacity-50 hover:bg-card",
              )}
            >
              Close
            </button>
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 overscroll-contain",
              // With a sticky footer, keep the shell fixed and let children scroll
              // internally (e.g. message body only) so the popup fits one screen.
              footer ? "flex flex-col overflow-hidden" : "overflow-y-auto",
              dense ? "pt-2" : "pt-4",
            )}
          >
            {children}
          </div>
          {footer ? (
            <div
              className={cn(
                "shrink-0 border-t border-border",
                dense ? "mt-2 pt-2" : "mt-4 pt-4",
              )}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    portalContainer ?? document.body,
  );
}
