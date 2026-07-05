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
  panelClassName,
  stackClassName,
  dense = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Width / layout overrides merged onto the default glass panel shell. */
  panelClassName?: string;
  /** Override z-index stacking for nested modals (e.g. inside listing form overlay). */
  stackClassName?: string;
  /** Tighter header/body spacing for compact forms. */
  dense?: boolean;
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
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !isClient) return null;

  return createPortal(
    <div className={stackClassName ?? "fixed inset-0 z-[70] overflow-y-auto overscroll-contain"}>
      <button
        type="button"
        aria-label="Close"
        className="modal-overlay fixed inset-0"
        onClick={onClose}
      />
      <div className="relative z-[71] flex min-h-[100dvh] justify-center px-2 py-4 sm:px-4 sm:py-8">
        <div
          ref={panelRef}
          className={cn(MODAL_PANEL_CLASS, "my-auto", panelClassName)}
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
              className={cn(
                "shrink-0 rounded-full border border-border bg-card font-semibold text-muted hover:bg-foreground/5",
                dense ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
              )}
            >
              Close
            </button>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", dense ? "pt-2" : "pt-4")}>
            {children}
          </div>
        </div>
      </div>
    </div>,
    portalContainer ?? document.body,
  );
}
