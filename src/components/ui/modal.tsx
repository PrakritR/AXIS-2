"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useIsClient } from "@/hooks/use-is-client";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { lockPortalScroll } from "@/lib/native/lock-portal-scroll";
import { MODAL_PANEL_CLASS } from "@/components/ui/modal-styles";
import { usePortalContainer } from "@/components/ui/portal-container-context";
import { ModalAssistantStrip } from "@/components/portal/modal-assistant-strip";
import { usePortalAssistantConfig } from "@/lib/axis-assistant/portal-assistant-context";
import { cn } from "@/lib/utils";

export { MODAL_INSET_BOX_CLASS, MODAL_INSET_BOX_PRE_CLASS, MODAL_PANEL_CLASS, MODAL_WARNING_BOX_CLASS, MODAL_FIELD_LABEL_CLASS } from "@/components/ui/modal-styles";

/** Top-right dismiss control — Carbon / Primer / Watson pattern (icon, 44px target). */
export const MODAL_HEADER_CLOSE_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Sticky footer action row: secondary actions first, primary action last (rightmost).
 * Pair with Modal `footer` — header × dismisses; Cancel in footer is explicit for forms.
 */
export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>{children}</div>;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  panelClassName,
  stackClassName,
  dense = false,
  assistantStrip = true,
  assistantContext,
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
  /** Tighter padding for compact dialogs. */
  dense?: boolean;
  /** When true (default in portal), show a compact PropLane Assistant strip. */
  assistantStrip?: boolean;
  /** Passed to the assistant as modal context (defaults to stringified title). */
  assistantContext?: string;
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

  const portalAssistant = usePortalAssistantConfig();
  const showAssistantStrip = assistantStrip && portalAssistant != null;
  const assistantHint =
    assistantContext?.trim() ||
    (typeof title === "string" ? title.trim() : "") ||
    "Portal modal";

  const [assistantConversationInstance, setAssistantConversationInstance] = useState(0);
  const wasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      setAssistantConversationInstance((n) => n + 1);
    }
    wasOpenRef.current = open;
  }, [open]);

  if (!open || !isClient) return null;

  return createPortal(
    <div className={stackClassName ?? "fixed inset-0 z-[70] overflow-y-auto overscroll-contain"}>
      <button
        type="button"
        aria-label="Close"
        className="modal-overlay fixed inset-0"
        onClick={onClose}
      />
      <div className="relative z-[71] flex min-h-full items-center justify-center px-2 py-4 sm:px-4 sm:py-6 [html[data-native]_&]:pt-[max(1rem,var(--native-safe-top))] [html[data-native]_&]:pb-[max(1rem,var(--native-safe-bottom))]">
        <div
          ref={panelRef}
          className={cn(MODAL_PANEL_CLASS, "min-h-0", panelClassName)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 border-b border-border",
              dense ? "gap-2 pb-2" : "gap-4 pb-4",
            )}
          >
            <h3
              id="modal-title"
              className={cn("min-w-0 flex-1 font-semibold text-foreground", dense ? "text-base" : "text-lg")}
            >
              {title}
            </h3>
            <button type="button" onClick={onClose} aria-label="Close" className={MODAL_HEADER_CLOSE_CLASS}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div
            className={cn(
              // The body is the modal's one scroll container. Children may still
              // pin an inner region (`min-h-0 flex-1 overflow-y-auto`) so only e.g.
              // a message body scrolls, but plain content must never be clipped —
              // `overflow-hidden` here made every below-the-fold field unreachable
              // on phones.
              "min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
              footer && "flex flex-col",
              dense ? "pt-2" : "pt-4",
            )}
          >
            {children}
          </div>
          {footer ? (
            <div
              className={cn(
                "shrink-0 border-t border-border bg-card",
                dense ? "mt-2 pt-3" : "mt-4 pt-4",
              )}
            >
              {footer}
            </div>
          ) : null}
          {showAssistantStrip && assistantConversationInstance > 0 ? (
            <ModalAssistantStrip
              contextHint={assistantHint}
              storageScopeKey={assistantHint}
              conversationInstance={assistantConversationInstance}
            />
          ) : null}
        </div>
      </div>
    </div>,
    portalContainer ?? document.body,
  );
}
