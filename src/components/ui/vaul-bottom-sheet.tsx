"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom sheet (Vaul + Radix Dialog) — drag handle, snap points, safe area.
 * Desktop callers should use centred {@link Modal} instead.
 */
export function VaulBottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[70] bg-black/50 motion-reduce:transition-none" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-[71] flex max-h-[92vh] flex-col rounded-t-2xl border-t border-border bg-background",
            "pb-[max(1rem,var(--native-safe-bottom,0px))] outline-none",
            "motion-reduce:transition-none",
          )}
          data-slot="vaul-bottom-sheet"
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="shrink-0 border-b border-border px-4 pb-3 pt-2">
            <Drawer.Title className="text-base font-semibold text-foreground">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-1 text-sm text-muted">{description}</Drawer.Description>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]">
            {children}
          </div>
          {footer ? <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div> : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
