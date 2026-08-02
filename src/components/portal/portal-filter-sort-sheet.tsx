"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, MODAL_HEADER_CLOSE_CLASS } from "@/components/ui/modal";
import { VaulBottomSheet } from "@/components/ui/vaul-bottom-sheet";
import {
  PORTAL_FILTER_PANEL_COMPACT_CLASS,
  PORTAL_FILTER_PANEL_SIZE_CLASS,
  PORTAL_FILTER_PANEL_WIDTH_CLASS,
  PORTAL_FILTER_BODY_CLASS,
} from "@/components/portal/filter-field-lists";
import { PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { cn } from "@/lib/utils";

const SMALL_PORTAL_VIEWPORT_QUERY = "(max-width: 1023px)";

function subscribeSmallPortalViewport(onStoreChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(SMALL_PORTAL_VIEWPORT_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSmallPortalViewport(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(SMALL_PORTAL_VIEWPORT_QUERY).matches;
}

function useSmallPortalViewport(): boolean {
  return useSyncExternalStore(subscribeSmallPortalViewport, getSmallPortalViewport, () => false);
}

function FilterResetLink({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      className="text-xs font-semibold text-primary hover:underline"
      onClick={onReset}
      data-attr="portal-filter-reset"
    >
      Reset
    </button>
  );
}

function FilterDropdownHeader({ onReset, onClose }: { onReset: () => void; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
      <p className="text-sm font-semibold text-foreground">Filter</p>
      <div className="flex items-center gap-3">
        <FilterResetLink onReset={onReset} />
        <button
          type="button"
          className={MODAL_HEADER_CLOSE_CLASS}
          aria-label="Close filters"
          onClick={onClose}
          data-attr="portal-filter-close"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

function FilterPanelFields({
  children,
  extraModalContent,
  onReset,
  compact = false,
}: {
  children: ReactNode;
  extraModalContent?: ReactNode;
  onReset: () => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "min-h-0 flex-1")}>
      {!compact ? (
        <div className="flex shrink-0 justify-end px-3 pb-1">
          <FilterResetLink onReset={onReset} />
        </div>
      ) : null}
      <div
        className={cn(
          compact
            ? "overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
            : "min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
        )}
      >
        <div className="flex flex-col gap-3 max-lg:gap-2">
          {children}
          {extraModalContent}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact portal toolbar filter pattern (Communication / Payments):
 * `inline` — mobile Vaul bottom sheet + inline controls from `md` up (default).
 * `panel` — Filter button on all breakpoints; sheet on mobile, modal on desktop.
 * `dropdown` — Filter button on all breakpoints; sheet on mobile, anchored popover on desktop.
 */
export function PortalFilterSortSheet({
  children,
  activeCount = 0,
  onReset,
  dataAttr = "portal-filter-sheet-open",
  extraModalContent,
  className,
  desktopPresentation = "dropdown",
  compactPanel = true,
}: {
  children: ReactNode;
  activeCount?: number;
  onReset: () => void;
  dataAttr?: string;
  extraModalContent?: ReactNode;
  className?: string;
  desktopPresentation?: "inline" | "panel" | "dropdown";
  compactPanel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useSmallPortalViewport();
  const compactTrigger = desktopPresentation === "panel" || desktopPresentation === "dropdown";
  const close = () => setOpen(false);
  const panelSizeClass = compactPanel ? PORTAL_FILTER_PANEL_COMPACT_CLASS : PORTAL_FILTER_PANEL_SIZE_CLASS;
  const fields = (
    <FilterPanelFields onReset={onReset} extraModalContent={extraModalContent} compact={compactPanel}>
      {children}
    </FilterPanelFields>
  );

  return (
    <>
      <div
        className={cn(
          "relative inline-flex w-fit min-w-0 max-w-full",
          compactTrigger ? "shrink-0 max-md:flex-1 max-md:w-full md:flex-initial" : "flex-1 md:hidden",
          className,
        )}
      >
        <Button
          type="button"
          variant="outline"
          className={cn(
            compactTrigger
              ? cn(PORTAL_HEADER_ACTION_BTN, "whitespace-nowrap w-full max-md:min-w-0 md:w-auto")
              : "h-9 min-w-0 w-full rounded-full text-xs font-semibold whitespace-nowrap",
          )}
          data-attr={dataAttr}
          aria-expanded={compactTrigger ? open : undefined}
          onClick={() => {
            if (desktopPresentation === "dropdown" && !isMobile) {
              setOpen((prev) => !prev);
              return;
            }
            setOpen(true);
          }}
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          Filter{activeCount > 0 ? ` · ${activeCount} active` : ""}
        </Button>
        {!isMobile && desktopPresentation === "dropdown" && open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close filters"
              onClick={close}
            />
            <div
              role="dialog"
              aria-label="Filter"
              data-slot="portal-filter-dropdown-panel"
              className={cn(
                panelSizeClass,
                PORTAL_FILTER_PANEL_WIDTH_CLASS,
                "portal-filter-dropdown-panel absolute left-1/2 top-[calc(100%+0.5rem)] z-50 -ml-[min(11rem,calc(50vw-1rem))] flex flex-col overflow-visible rounded-2xl border border-border shadow-[0_12px_40px_rgba(15,23,42,0.12)]",
              )}
              data-attr="portal-filter-dropdown-panel"
            >
              <FilterDropdownHeader onReset={onReset} onClose={close} />
              <div className={cn(PORTAL_FILTER_BODY_CLASS, "flex-1")}>{fields}</div>
            </div>
          </>
        ) : null}
      </div>
      {!compactTrigger ? (
        <div className="hidden min-w-0 flex-wrap items-center gap-1.5 sm:gap-2.5 md:flex md:gap-3">
          {children}
        </div>
      ) : null}
      {isMobile ? (
        <VaulBottomSheet open={open} onOpenChange={setOpen} title="Filter" flushBody>
          <div className="flex w-full flex-col overflow-hidden">{fields}</div>
        </VaulBottomSheet>
      ) : desktopPresentation === "panel" ? (
        <Modal
          open={open}
          onClose={close}
          title="Filter"
          fullPage={false}
          panelClassName={cn(
            panelSizeClass,
            PORTAL_FILTER_PANEL_WIDTH_CLASS,
            "portal-filter-dropdown-panel flex flex-col overflow-visible",
          )}
          dense
          scrollableContent
          assistantStrip={false}
          footer={
            compactPanel ? (
              <div className="flex w-full justify-end">
                <FilterResetLink onReset={onReset} />
              </div>
            ) : undefined
          }
        >
          {fields}
        </Modal>
      ) : null}
    </>
  );
}

/** Count non-default property / resident / sort filters for the mobile badge. */
export function portalFilterActiveCount(
  values: Array<string | number | boolean | null | undefined | readonly string[]>,
): number {
  return values.filter((v) => {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return Boolean(v);
  }).length;
}
