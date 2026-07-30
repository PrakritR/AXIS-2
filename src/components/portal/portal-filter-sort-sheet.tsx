"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { VaulBottomSheet } from "@/components/ui/vaul-bottom-sheet";
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

function FilterSheetFooter({ onReset, onDone }: { onReset: () => void; onDone: () => void }) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        className="flex-1 rounded-full"
        onClick={() => {
          onReset();
        }}
      >
        Reset
      </Button>
      <Button type="button" variant="primary" className="flex-1 rounded-full" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

/**
 * Compact portal toolbar filter pattern (Communication / Payments):
 * `inline` — mobile Vaul bottom sheet + inline controls from `md` up (default).
 * `panel` — Filter button on all breakpoints; sheet on mobile, modal on desktop.
 */
export function PortalFilterSortSheet({
  children,
  activeCount = 0,
  onReset,
  dataAttr = "portal-filter-sheet-open",
  extraModalContent,
  className,
  desktopPresentation = "inline",
}: {
  children: ReactNode;
  activeCount?: number;
  onReset: () => void;
  dataAttr?: string;
  extraModalContent?: ReactNode;
  className?: string;
  desktopPresentation?: "inline" | "panel";
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useSmallPortalViewport();
  const panelOnly = desktopPresentation === "panel";
  const sheetBody = (
    <div className="flex flex-col gap-4">
      {children}
      {extraModalContent}
    </div>
  );
  const footer = (
    <FilterSheetFooter
      onReset={onReset}
      onDone={() => {
        setOpen(false);
      }}
    />
  );

  return (
    <>
      <div
        className={cn(
          "flex min-w-0",
          panelOnly ? "shrink-0 max-md:flex-1 md:flex-initial" : "flex-1 md:hidden",
          className,
        )}
      >
        <Button
          type="button"
          variant="outline"
          className={cn(
            panelOnly
              ? cn(PORTAL_HEADER_ACTION_BTN, "whitespace-nowrap w-full max-md:min-w-0 md:w-auto")
              : "h-9 min-w-0 w-full rounded-full text-xs font-semibold whitespace-nowrap",
          )}
          data-attr={dataAttr}
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          Filter{activeCount > 0 ? ` · ${activeCount} active` : ""}
        </Button>
      </div>
      {!panelOnly ? (
        <div className="hidden min-w-0 flex-wrap items-center gap-1.5 sm:gap-2.5 md:flex md:gap-3">
          {children}
        </div>
      ) : null}
      {isMobile ? (
        <VaulBottomSheet
          open={open}
          onOpenChange={setOpen}
          title="Filter"
          footer={footer}
          autoElevate
        >
          {sheetBody}
        </VaulBottomSheet>
      ) : panelOnly ? (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Filter"
          footer={footer}
          panelClassName="flex max-h-[min(92dvh,40rem)] w-full max-w-md flex-col"
          dense
          scrollableContent
          assistantStrip={false}
        >
          {sheetBody}
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
