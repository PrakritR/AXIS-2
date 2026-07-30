"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { VaulBottomSheet } from "@/components/ui/vaul-bottom-sheet";
import { cn } from "@/lib/utils";

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
 * `panel` — Filter & sort button on all breakpoints; sheet on mobile, modal on desktop.
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
            "h-9 rounded-full text-xs font-semibold whitespace-nowrap",
            panelOnly ? "w-full max-md:min-w-0 md:w-auto md:px-4" : "min-w-0 w-full",
          )}
          data-attr={dataAttr}
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          Filter &amp; sort{activeCount > 0 ? ` · ${activeCount} active` : ""}
        </Button>
      </div>
      {!panelOnly ? (
        <div className="hidden min-w-0 flex-wrap items-center gap-1.5 sm:gap-2.5 md:flex md:gap-3">
          {children}
        </div>
      ) : null}
      {panelOnly ? (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Filter & sort"
          footer={footer}
          panelClassName="max-w-md"
          dense
          assistantStrip={false}
        >
          {sheetBody}
        </Modal>
      ) : (
        <VaulBottomSheet
          open={open}
          onOpenChange={setOpen}
          title="Filter & sort"
          footer={footer}
        >
          {sheetBody}
        </VaulBottomSheet>
      )}
    </>
  );
}

/** Count non-default property / resident / sort filters for the mobile badge. */
export function portalFilterActiveCount(
  values: Array<string | number | boolean | null | undefined>,
): number {
  return values.filter((v) => {
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return Boolean(v);
  }).length;
}
