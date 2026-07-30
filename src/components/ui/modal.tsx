"use client";

import type { ComponentType, CSSProperties, ReactNode, Ref } from "react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
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
 * Sticky footer action row: primary and secondary *actions* only (Save, Delete, Send).
 * Dismiss via the header × — do not add Cancel / Close buttons in footers.
 */
export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2", className)}>{children}</div>;
}

const SMALL_PORTAL_VIEWPORT_QUERY = "(max-width: 1023px)";

function subscribeSmallPortalViewport(onStoreChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(SMALL_PORTAL_VIEWPORT_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSmallPortalViewportPresentation(): "drawer" | "dialog" {
  if (typeof window.matchMedia !== "function") return "dialog";
  return window.matchMedia(SMALL_PORTAL_VIEWPORT_QUERY).matches ? "drawer" : "dialog";
}

/** Desktop dialog vs mobile Vaul drawer — matches portal `lg` breakpoint. */
function useModalPresentation(): "drawer" | "dialog" {
  return useSyncExternalStore(
    subscribeSmallPortalViewport,
    getSmallPortalViewportPresentation,
    () => "dialog",
  );
}

const DEFAULT_STACK_CLASS = "fixed inset-0 z-[70] overflow-y-auto overscroll-contain";
const DEFAULT_CENTER_CLASS =
  "relative z-[71] flex min-h-full items-center justify-center px-2 py-4 sm:px-4 sm:py-6 [html[data-native]_&]:pt-[max(1rem,var(--native-safe-top))] [html[data-native]_&]:pb-[max(1rem,var(--native-safe-bottom))]";

/** FieldSingleSelect menus portal to `document.body`; keep Radix/Vaul from treating them as outside dismiss. */
function allowPortaledFieldSelectInteraction(event: Event) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('[role="listbox"]')) {
    event.preventDefault();
  }
}

export type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** `auto` picks Vaul drawer below portal `lg`, Radix dialog at `lg+`. */
  presentation?: "auto" | "drawer" | "dialog";
  stackClassName?: string;
  overlayClassName?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  contentRef?: Ref<HTMLDivElement>;
  centerClassName?: string;
  lockScroll?: boolean;
  portalContainer?: HTMLElement | null;
  hideOverlay?: boolean;
  showDrawerHandle?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaBusy?: boolean;
};

/** Radix Dialog (desktop) + Vaul drawer (mobile) shell for custom modal layouts. */
export function ModalShell({
  open,
  onClose,
  children,
  presentation = "auto",
  stackClassName,
  overlayClassName,
  panelClassName,
  panelStyle,
  contentRef,
  centerClassName,
  lockScroll = true,
  portalContainer: portalContainerProp,
  hideOverlay = false,
  showDrawerHandle = true,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaBusy,
}: ModalShellProps) {
  const isClient = useIsClient();
  const autoPresentation = useModalPresentation();
  const portalContainerContext = usePortalContainer();
  const portalContainer = portalContainerProp ?? portalContainerContext;
  const resolvedPresentation = presentation === "auto" ? autoPresentation : presentation;

  useEffect(() => {
    if (!open || !lockScroll) return;
    return lockPortalScroll();
  }, [open, lockScroll]);

  if (!open || !isClient) return null;

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  const stackClass = stackClassName ?? DEFAULT_STACK_CLASS;
  const centerClass = centerClassName ?? DEFAULT_CENTER_CLASS;
  const overlayClass = overlayClassName ?? MODAL_OVERLAY_BACKDROP_CLASS;

  const contentA11y = {
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    "aria-busy": ariaBusy,
  };

  if (resolvedPresentation === "drawer") {
    return (
      <Drawer.Root open={open} onOpenChange={handleOpenChange} handleOnly noBodyStyles>
        <Drawer.Portal container={portalContainer ?? undefined}>
          {!hideOverlay ? (
            <Drawer.Overlay
              className={cn(
                overlayClass,
                "z-[70] motion-reduce:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              )}
            />
          ) : null}
          <Drawer.Content
            ref={contentRef}
            data-slot="modal-vaul-drawer"
            style={panelStyle}
            className={panelClassName}
            onPointerDownOutside={allowPortaledFieldSelectInteraction}
            onInteractOutside={allowPortaledFieldSelectInteraction}
            {...contentA11y}
          >
            {showDrawerHandle ? (
              <Drawer.Handle className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
            ) : null}
            {children}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <div className={stackClass}>
          {!hideOverlay ? (
            <Dialog.Overlay
              className={cn(
                overlayClass,
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none",
              )}
            />
          ) : null}
          <div className={centerClass}>
            <Dialog.Content
              ref={contentRef}
              data-slot="modal-radix-dialog"
              style={panelStyle}
              className={panelClassName}
              onPointerDownOutside={allowPortaledFieldSelectInteraction}
              onInteractOutside={allowPortaledFieldSelectInteraction}
              {...contentA11y}
            >
              {children}
            </Dialog.Content>
          </div>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
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
  assistantDefaultExpanded = false,
  scrollableContent = true,
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
  assistantDefaultExpanded?: boolean;
  scrollableContent?: boolean;
  TitlePrimitive: ComponentType<ModalTitlePrimitiveProps>;
  DescriptionPrimitive: ComponentType<ModalDescriptionPrimitiveProps>;
  ClosePrimitive: ComponentType<ModalClosePrimitiveProps>;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden", scrollableContent ? "min-h-0 flex-1" : "shrink-0")}>
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
          scrollableContent ? "flex min-h-0 flex-1" : "flex shrink-0",
          showAssistantStrip && assistantExpanded ? "flex-col @2xl:flex-row" : "flex-col",
        )}
      >
        <div
          className={cn(
            scrollableContent
              ? "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
              : "min-w-0 shrink-0 flex-col",
            footer && scrollableContent && "flex flex-col",
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
            defaultExpanded={assistantDefaultExpanded}
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
    </div>
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
  assistantDefaultExpanded = false,
  /** Drawer fills the viewport below portal `lg` (no partial sheet). */
  fullScreenMobile = false,
  /** When false, modal body does not scroll — children own internal overflow. */
  scrollableContent = true,
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
  /** Open the assistant strip expanded when the modal opens. */
  assistantDefaultExpanded?: boolean;
  fullScreenMobile?: boolean;
  scrollableContent?: boolean;
}) {
  const presentation = useModalPresentation();
  const portalAssistant = usePortalAssistantConfig();
  const showAssistantStrip = assistantStrip && portalAssistant != null;
  const assistantHint =
    assistantContext?.trim() ||
    (typeof title === "string" ? title.trim() : "") ||
    "Portal modal";

  const [assistantConversationInstance, setAssistantConversationInstance] = useState(0);
  const [assistantExpanded, setAssistantExpanded] = useState(assistantDefaultExpanded);
  const wasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      setAssistantConversationInstance((n) => n + 1);
      setAssistantExpanded(assistantDefaultExpanded);
    }
    wasOpenRef.current = open;
  }, [open]);

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
    assistantDefaultExpanded,
    scrollableContent,
  };

  if (!open) return null;

  if (presentation === "drawer") {
    return (
      <ModalShell
        open={open}
        onClose={onClose}
        presentation="drawer"
        showDrawerHandle={!fullScreenMobile}
        ariaDescribedBy={description ? "modal-description" : undefined}
        panelClassName={cn(
          fullScreenMobile
            ? "modal-panel fixed inset-0 z-[71] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden rounded-none border-0 shadow-none outline-none pt-[max(0.75rem,var(--native-safe-top,0px))] pb-[max(1rem,var(--native-safe-bottom,0px))]"
            : "modal-panel fixed inset-x-0 bottom-0 z-[71] flex max-h-[min(92dvh,56rem)] flex-col overflow-hidden rounded-t-2xl border-t border-border shadow-[var(--shadow-card)] outline-none pb-[max(1rem,var(--native-safe-bottom,0px))] pt-3 motion-reduce:transition-none",
          dense ? "px-4" : "px-5",
          panelClassName,
        )}
      >
        <ModalPanelInner
          {...panelInnerProps}
          TitlePrimitive={Drawer.Title}
          DescriptionPrimitive={Drawer.Description}
          ClosePrimitive={Drawer.Close}
        />
      </ModalShell>
    );
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      presentation="dialog"
      stackClassName={stackClassName}
      ariaDescribedBy={description ? "modal-description" : undefined}
      panelClassName={cn(MODAL_PANEL_CLASS, "min-h-0 @container", panelClassName)}
    >
      <ModalPanelInner
        {...panelInnerProps}
        TitlePrimitive={Dialog.Title}
        DescriptionPrimitive={Dialog.Description}
        ClosePrimitive={Dialog.Close}
      />
    </ModalShell>
  );
}
