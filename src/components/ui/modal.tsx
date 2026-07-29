"use client";

import type { ComponentType, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { useIsClient } from "@/hooks/use-is-client";
import { lockPortalScroll } from "@/lib/native/lock-portal-scroll";
import { MODAL_PANEL_CLASS, MODAL_OVERLAY_BACKDROP_CLASS } from "@/components/ui/modal-styles";
import { usePortalContainer } from "@/components/ui/portal-container-context";
import { ModalAssistantStrip } from "@/components/portal/modal-assistant-strip";
import { usePortalAssistantConfig } from "@/lib/axis-assistant/portal-assistant-context";
import { cn } from "@/lib/utils";

export { MODAL_INSET_BOX_CLASS, MODAL_INSET_BOX_PRE_CLASS, MODAL_PANEL_CLASS, MODAL_WARNING_BOX_CLASS, MODAL_FIELD_LABEL_CLASS } from "@/components/ui/modal-styles";

/** Top-right dismiss control — Carbon / Primer / Watson pattern (icon, 44px target). */
export const MODAL_HEADER_CLOSE_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:w-10";

/**
 * Sticky footer action row: secondary actions first, primary action last (rightmost).
 * Pair with Modal `footer` — header × dismisses; Cancel in footer is explicit for forms.
 */
export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>{children}</div>;
}

const SMALL_PORTAL_VIEWPORT_QUERY = "(max-width: 1023px)";

/** Desktop dialog vs mobile Vaul drawer — matches portal `lg` breakpoint. */
function useModalPresentation(): "drawer" | "dialog" {
  const [presentation, setPresentation] = useState<"drawer" | "dialog">(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia(SMALL_PORTAL_VIEWPORT_QUERY).matches ? "drawer" : "dialog";
    }
    return "dialog";
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(SMALL_PORTAL_VIEWPORT_QUERY);
    const sync = () => setPresentation(mql.matches ? "drawer" : "dialog");
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return presentation;
}

type ModalTitlePrimitiveProps = {
  asChild?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
};

type ModalDescriptionPrimitiveProps = {
  asChild?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
};

type ModalClosePrimitiveProps = {
  asChild?: boolean;
  children: ReactNode;
};

function ModalPanelInner({
  title,
  description,
  children,
  footer,
  dense,
  onClose,
  showAssistantStrip,
  assistantHint,
  assistantStorageScopeKey,
  assistantConversationInstance,
  assistantExpanded,
  onAssistantExpandedChange,
  TitlePrimitive,
  DescriptionPrimitive,
  ClosePrimitive,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  dense: boolean;
  onClose: () => void;
  showAssistantStrip: boolean;
  assistantHint: string;
  assistantStorageScopeKey?: string;
  assistantConversationInstance: number;
  assistantExpanded: boolean;
  onAssistantExpandedChange: (expanded: boolean) => void;
  TitlePrimitive: ComponentType<ModalTitlePrimitiveProps>;
  DescriptionPrimitive: ComponentType<ModalDescriptionPrimitiveProps>;
  ClosePrimitive: ComponentType<ModalClosePrimitiveProps>;
}) {
  return (
    <>
      <div
        className={cn(
          "flex shrink-0 flex-col border-b border-border",
          dense ? "gap-2 pb-2" : "gap-3 pb-4",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <TitlePrimitive asChild>
            <h3
              id="modal-title"
              className={cn(
                "min-w-0 flex-1 font-semibold leading-tight text-foreground",
                dense ? "text-base" : "text-lg",
              )}
            >
              {title}
            </h3>
          </TitlePrimitive>
          <ClosePrimitive asChild>
            <button type="button" onClick={onClose} aria-label="Close" className={MODAL_HEADER_CLOSE_CLASS}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </ClosePrimitive>
        </div>
        {description ? (
          <DescriptionPrimitive asChild>
            <p id="modal-description" className="text-sm leading-relaxed text-muted">
              {description}
            </p>
          </DescriptionPrimitive>
        ) : null}
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-1",
          showAssistantStrip && assistantExpanded ? "flex-col @2xl:flex-row" : "flex-col",
        )}
      >
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
            footer && "flex flex-col",
            dense ? "pt-2" : "pt-4",
          )}
        >
          {children}
        </div>
        {showAssistantStrip && assistantConversationInstance > 0 ? (
          <ModalAssistantStrip
            contextHint={assistantHint}
            storageScopeKey={assistantStorageScopeKey?.trim() || assistantHint}
            conversationInstance={assistantConversationInstance}
            onExpandedChange={onAssistantExpandedChange}
            className={cn(dense ? "px-0" : undefined)}
          />
        ) : null}
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
    </>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  description,
  panelClassName,
  stackClassName,
  dense = false,
  assistantStrip = true,
  assistantContext,
  assistantStorageScopeKey,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  panelClassName?: string;
  stackClassName?: string;
  dense?: boolean;
  assistantStrip?: boolean;
  assistantContext?: string;
  assistantStorageScopeKey?: string;
}) {
  const isClient = useIsClient();
  const presentation = useModalPresentation();
  const portalContainer = usePortalContainer();

  useEffect(() => {
    if (!open) return;
    return lockPortalScroll();
  }, [open]);

  const portalAssistant = usePortalAssistantConfig();
  const showAssistantStrip = assistantStrip && portalAssistant != null;
  const assistantHint =
    assistantContext?.trim() ||
    (typeof title === "string" ? title.trim() : "") ||
    "Portal modal";

  const [assistantConversationInstance, setAssistantConversationInstance] = useState(0);
  const [assistantExpanded, setAssistantExpanded] = useState(false);
  const wasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      setAssistantConversationInstance((n) => n + 1);
    }
    wasOpenRef.current = open;
  }, [open]);

  if (!open || !isClient) return null;

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  const stackShellClass = stackClassName ?? "fixed inset-0 z-[70] overflow-y-auto overscroll-contain";

  const panelInnerProps = {
    title,
    description,
    children,
    footer,
    dense,
    onClose,
    showAssistantStrip,
    assistantHint,
    assistantStorageScopeKey,
    assistantConversationInstance,
    assistantExpanded,
    onAssistantExpandedChange: setAssistantExpanded,
  };

  if (presentation === "drawer") {
    return (
      <Drawer.Root open={open} onOpenChange={handleOpenChange} shouldScaleBackground>
        <Drawer.Portal container={portalContainer ?? undefined}>
          <Drawer.Overlay
            className={cn(
              MODAL_OVERLAY_BACKDROP_CLASS,
              "z-[70] motion-reduce:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
          />
          <Drawer.Content
            data-slot="modal-vaul-drawer"
            className={cn(
              "modal-panel fixed inset-x-0 bottom-0 z-[71] flex max-h-[min(92dvh,56rem)] flex-col overflow-hidden rounded-t-2xl border-t border-border shadow-[var(--shadow-card)] outline-none",
              "pb-[max(1rem,var(--native-safe-bottom,0px))] pt-3",
              "motion-reduce:transition-none",
              dense ? "px-4" : "px-5",
              panelClassName,
            )}
            aria-describedby={description ? "modal-description" : undefined}
          >
            <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
            <ModalPanelInner
              {...panelInnerProps}
              TitlePrimitive={Drawer.Title}
              DescriptionPrimitive={Drawer.Description}
              ClosePrimitive={Drawer.Close}
            />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <div className={stackShellClass}>
          <Dialog.Overlay
            className={cn(
              MODAL_OVERLAY_BACKDROP_CLASS,
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none",
            )}
          />
          <div className="relative z-[71] flex min-h-full items-center justify-center px-2 py-4 sm:px-4 sm:py-6 [html[data-native]_&]:pt-[max(1rem,var(--native-safe-top))] [html[data-native]_&]:pb-[max(1rem,var(--native-safe-bottom))]">
            <Dialog.Content
              data-slot="modal-radix-dialog"
              className={cn(MODAL_PANEL_CLASS, "min-h-0 @container", panelClassName)}
              aria-describedby={description ? "modal-description" : undefined}
            >
              <ModalPanelInner
                {...panelInnerProps}
                TitlePrimitive={Dialog.Title}
                DescriptionPrimitive={Dialog.Description}
                ClosePrimitive={Dialog.Close}
              />
            </Dialog.Content>
          </div>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
