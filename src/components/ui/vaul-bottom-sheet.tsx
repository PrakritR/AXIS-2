"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { MODAL_HEADER_CLOSE_CLASS } from "@/components/ui/modal";
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
  /**
   * When true, short sheets sit higher on the screen (filter panels) instead of hugging
   * the bottom nav with a large empty gap above.
   */
  autoElevate = false,
  flushBody = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  fullScreen?: boolean;
  autoElevate?: boolean;
  flushBody?: boolean;
}) {
  const contentHugging = !fullScreen;
  const sheetRef = useRef<HTMLDivElement>(null);
  const [elevated, setElevated] = useState(false);

  useLayoutEffect(() => {
    if (!open || !autoElevate || fullScreen) {
      setElevated(false);
      return;
    }
    const sheet = sheetRef.current;
    if (!sheet) return;

    const measure = () => {
      const height = sheet.getBoundingClientRect().height;
      const viewport = window.innerHeight || document.documentElement.clientHeight;
      setElevated(height < viewport * 0.52);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open, autoElevate, fullScreen, children, footer, title, description]);

  const elevatedPlacement =
    autoElevate &&
    elevated &&
    !fullScreen &&
    "bottom-[max(26vh,calc(var(--portal-native-bottom-nav-inset,0px)+5.5rem))] top-auto";

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} handleOnly>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[70] bg-black/50 motion-reduce:transition-none" />
        <Drawer.Content
          ref={sheetRef}
          className={cn(
            "fixed inset-x-0 bottom-0 z-[71] flex flex-col border-t border-border bg-background outline-none motion-reduce:transition-none",
            fullScreen
              ? "top-[max(1.25rem,var(--native-safe-top,0px))] max-h-none rounded-t-2xl"
              : cn(
                  "h-auto max-h-[min(88dvh,36rem)] rounded-t-2xl",
                  elevatedPlacement,
                ),
            !footer && "pb-[max(1rem,var(--native-safe-bottom,0px))]",
          )}
          data-slot="vaul-bottom-sheet"
          data-full-screen={fullScreen ? "true" : "false"}
          onPointerDownOutside={allowPortaledFieldSelectInteraction}
          onInteractOutside={allowPortaledFieldSelectInteraction}
        >
          <Drawer.Handle className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-2">
            <div className="min-w-0 flex-1">
              <Drawer.Title className="text-base font-semibold text-foreground">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="mt-1 text-sm text-muted">{description}</Drawer.Description>
              ) : null}
            </div>
            <Drawer.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className={MODAL_HEADER_CLOSE_CLASS}
                onClick={() => onOpenChange(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </Drawer.Close>
          </div>
          <div
            className={cn(
              "flex flex-col",
              contentHugging ? "shrink-0" : "min-h-0 flex-1 overflow-hidden",
            )}
          >
            <div
              className={cn(
                flushBody ? "px-0" : "px-4",
                "py-3",
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
