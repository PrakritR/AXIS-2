"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

/** Keep portaled FieldSingleSelect / CheckboxMultiSelect menus clickable inside sheets. */
function allowPortaledFieldSelectInteraction(event: Event) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('[role="listbox"]')) {
    event.preventDefault();
  }
}

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
  fullScreen = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Nearly full viewport — dense panels that need maximum height. */
  fullScreen?: boolean;
}) {
  const contentHugging = !fullScreen;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[70] bg-black/50 motion-reduce:transition-none" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-[71] flex flex-col border-t border-border bg-background outline-none motion-reduce:transition-none",
            fullScreen
              ? "top-[max(1.25rem,var(--native-safe-top,0px))] max-h-none rounded-t-2xl"
              : "h-auto max-h-[min(88dvh,36rem)] rounded-t-2xl",
            !footer && "pb-[max(1rem,var(--native-safe-bottom,0px))]",
          )}
          data-slot="vaul-bottom-sheet"
          data-full-screen={fullScreen ? "true" : "false"}
          onPointerDownOutside={allowPortaledFieldSelectInteraction}
          onInteractOutside={allowPortaledFieldSelectInteraction}
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="shrink-0 border-b border-border px-4 pb-3 pt-2">
            <Drawer.Title className="text-base font-semibold text-foreground">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-1 text-sm text-muted">{description}</Drawer.Description>
            ) : null}
          </div>
          <div
            className={cn(
              "flex flex-col",
              contentHugging ? "shrink-0" : "min-h-0 flex-1 overflow-hidden",
            )}
          >
            <div
              className={cn(
                "px-4 py-3",
                contentHugging
                  ? "overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
                  : "min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
              )}
            >
              {children}
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
                {footer}
              </div>
            ) : null}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
