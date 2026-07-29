"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VaulBottomSheet } from "@/components/ui/vaul-bottom-sheet";

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
 * mobile Vaul bottom sheet + inline controls from `md` up.
 */
export function PortalFilterSortSheet({
  children,
  activeCount = 0,
  onReset,
  dataAttr = "portal-filter-sheet-open",
  extraModalContent,
  className,
}: {
  children: ReactNode;
  activeCount?: number;
  onReset: () => void;
  dataAttr?: string;
  extraModalContent?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const sheetBody = (
    <div className="flex flex-col gap-4">
      {children}
      {extraModalContent}
    </div>
  );

  return (
    <>
      <div className={`flex min-w-0 flex-1 md:hidden ${className ?? ""}`.trim()}>
        <Button
          type="button"
          variant="outline"
          className="h-9 min-w-0 w-full rounded-full text-xs font-semibold"
          data-attr={dataAttr}
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          Filter &amp; sort{activeCount > 0 ? ` · ${activeCount} active` : ""}
        </Button>
      </div>
      <div className="hidden min-w-0 flex-wrap items-center gap-1.5 sm:gap-2.5 md:flex md:gap-3">
        {children}
      </div>
      <VaulBottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Filter & sort"
        footer={<FilterSheetFooter onReset={onReset} onDone={() => setOpen(false)} />}
      >
        {sheetBody}
      </VaulBottomSheet>
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
