"use client";

import type { CSSProperties, ReactNode } from "react";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { MODAL_HEADER_CLOSE_CLASS } from "@/components/ui/modal";
import { isPortaledFieldSelectMenuTarget } from "@/components/ui/field-select-portal-interaction";
import { cn } from "@/lib/utils";

/**
 * Single source of the raised-sheet offset. It is published as a custom property on the
 * elevated sheet so the placement (`bottom`), the max-height, and vaul's exit distance
 * (`--initial-transform`) all read the SAME number — three literal copies of this
 * expression would drift, and a sheet placed by one number and animated by another slides
 * off screen short and then unmounts abruptly.
 */
const RAISED_SHEET_OFFSET_VAR = "--portal-raised-sheet-offset";
const RAISED_SHEET_OFFSET =
  "max(32vh, calc(var(--portal-native-bottom-nav-inset, 0px) + 6rem))";

/**
 * Vaul's `slideFromBottom` / `slideToBottom` keyframes both translate by
 * `var(--initial-transform, 100%)` — 100% of the DRAWER's own height, which clears the
 * viewport only for a bottom-anchored drawer. A raised sheet has to travel its own height
 * PLUS the gap it leaves below itself, or it ends the close animation still on screen.
 * This is vaul's own escape hatch for offset drawers; resetting the placement on close
 * instead would reintroduce the mid-interaction jump this component exists to remove.
 */
const RAISED_SHEET_STYLE = {
  [RAISED_SHEET_OFFSET_VAR]: RAISED_SHEET_OFFSET,
  "--initial-transform": `calc(100% + var(${RAISED_SHEET_OFFSET_VAR}))`,
} as CSSProperties;

/**
 * Vaul ships `[data-vaul-drawer]{touch-action:none}`, and a browser resolves touch-action by
 * INTERSECTING the values up the ancestor chain — so `none` on the drawer disables finger
 * panning for every descendant, no matter that the scroll region itself says `auto`. A
 * sheet taller than the viewport therefore scrolled with a mouse wheel and not with a
 * thumb, which is the only way anyone actually uses it. `pan-y` restores vertical scrolling
 * while still blocking the horizontal pans vaul does not want; drag-to-dismiss is
 * unaffected because every sheet here is `handleOnly`, so a drag can only start on
 * `[data-vaul-handle]`, which carries its own `touch-action`.
 */
const SHEET_TOUCH_ACTION: CSSProperties = { touchAction: "pan-y" };

/** Keep portaled FieldSingleSelect / CheckboxMultiSelect menus clickable inside sheets. */
function allowPortaledFieldSelectInteraction(event: Event) {
  if (isPortaledFieldSelectMenuTarget(event.target)) {
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
   * When true the sheet sits in the RAISED position (filter panels) instead of hugging the
   * bottom nav. This is unconditional on purpose: it used to be gated on a
   * `height < viewport * 0.52` measurement, so a sheet that grew or shrank while open —
   * which is exactly what an opening filter dropdown used to do — flipped the placement and
   * the whole sheet visibly JUMPED up mid-interaction. A fixed placement cannot jump.
   * The elevated max-height is derived from the same offset so a tall sheet still fits on
   * screen instead of running off the top, which is what the measurement was guarding.
   */
  autoElevate = false,
  flushBody = false,
  lockBodyScroll = false,
  /**
   * Override default `max-h-[min(88dvh,36rem)]` for tall filter sheets. IGNORED when
   * `autoElevate` is set: an elevated sheet derives its max-height from the raised offset,
   * and two `max-h-*` utilities on one element would resolve by CSS source order rather
   * than class order. Only pass this on a bottom-anchored sheet.
   */
  maxHeightClass,
  /**
   * Floor height for the RAISED sheet, so a portaled menu can always be contained inside it
   * rather than hanging onto the scrim. Clamped against the raised max-height, so a short
   * viewport can never push the sheet's top off screen. Ignored unless `autoElevate`.
   */
  minHeightPx,
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
  /** When true, the sheet body does not scroll (e.g. an open filter field menu). */
  lockBodyScroll?: boolean;
  maxHeightClass?: string;
  minHeightPx?: number;
}) {
  const contentHugging = !fullScreen;
  const elevated = autoElevate && !fullScreen;

  /* One raised placement, applied statically. The elevated max-height is the SAME offset
     subtracted from the viewport, so it replaces (rather than fights) the caller's
     `maxHeightClass` — two `max-h-*` utilities on one element would resolve by CSS source
     order, not class order. Both read {@link RAISED_SHEET_OFFSET_VAR}. */
  const elevatedPlacement =
    "bottom-[var(--portal-raised-sheet-offset)] top-auto " +
    "max-h-[calc(100dvh-var(--portal-raised-sheet-offset)-1rem)]";

  /* `min()` against the same raised max-height, not a bare pixel floor: on a short viewport
     a bare floor would out-rank max-height (min-height always wins) and push the sheet's
     top off screen. */
  const raisedMinHeight =
    elevated && minHeightPx
      ? {
          minHeight: `min(${minHeightPx}px, calc(100dvh - var(${RAISED_SHEET_OFFSET_VAR}) - 1rem))`,
        }
      : undefined;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} handleOnly>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[70] bg-black/50 motion-reduce:transition-none" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-[71] flex flex-col overflow-visible border-t border-border bg-background outline-none motion-reduce:transition-none",
            fullScreen
              ? "inset-0 top-0 z-[71] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden rounded-none border-0 pt-[max(0.75rem,var(--native-safe-top,0px))] pb-[max(1rem,var(--native-safe-bottom,0px))]"
              : cn(
                  "h-auto rounded-t-2xl",
                  elevated ? elevatedPlacement : (maxHeightClass ?? "max-h-[min(88dvh,36rem)]"),
                ),
            !footer && "pb-[max(1rem,var(--native-safe-bottom,0px))]",
          )}
          style={
            elevated
              ? { ...RAISED_SHEET_STYLE, ...SHEET_TOUCH_ACTION, ...raisedMinHeight }
              : SHEET_TOUCH_ACTION
          }
          data-slot="vaul-bottom-sheet"
          data-elevated={elevated ? "true" : "false"}
          data-full-screen={fullScreen ? "true" : "false"}
          onPointerDownOutside={allowPortaledFieldSelectInteraction}
          onInteractOutside={allowPortaledFieldSelectInteraction}
        >
          {!fullScreen ? (
            <Drawer.Handle className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
          ) : null}
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
          {/* `min-h-0` rather than `shrink-0`: a hugging sheet still sizes to its content
              (`flex: 0 1 auto`), but once that content exceeds the sheet's max-height it
              shrinks and scrolls INSIDE the sheet. With `shrink-0` it overflowed the sheet
              instead, which is why callers had to hand-cap their body height and why a
              four-field filter pushed its last fields past the sheet's bottom edge. */}
          <div className={cn("flex flex-col", contentHugging ? "min-h-0" : "min-h-0 flex-1 overflow-hidden")}>
            <div
              className={cn(
                flushBody ? "px-0" : "px-4",
                "py-3",
                "min-h-0",
                lockBodyScroll
                  ? "overflow-hidden"
                  : "overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
                !contentHugging && "flex-1",
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
