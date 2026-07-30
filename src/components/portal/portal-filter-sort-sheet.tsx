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
 * `dropdown` — Filter button on all breakpoints; sheet on mobile, anchored popover on desktop.
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
  desktopPresentation?: "inline" | "panel" | "dropdown";
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useSmallPortalViewport();
  const compactTrigger = desktopPresentation === "panel" || desktopPresentation === "dropdown";
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
          "relative flex min-w-0",
          compactTrigger ? "shrink-0 max-md:flex-1 md:flex-initial" : "flex-1 md:hidden",
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
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-label="Filter"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex w-[min(20rem,calc(100vw-2rem))] max-h-[min(70dvh,28rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_40px_rgba(15,23,42,0.12)]"
              data-attr="portal-filter-dropdown-panel"
            >
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Filter</p>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain p-4">{sheetBody}</div>
              <div className="shrink-0 border-t border-border p-4">{footer}</div>
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
        <VaulBottomSheet
          open={open}
          onOpenChange={setOpen}
          title="Filter"
          footer={footer}
          autoElevate
        >
          {sheetBody}
        </VaulBottomSheet>
      ) : desktopPresentation === "panel" ? (
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
