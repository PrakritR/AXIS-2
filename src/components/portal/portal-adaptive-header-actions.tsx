"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { cn } from "@/lib/utils";

export type PortalAdaptiveHeaderAction = {
  id: string;
  node: ReactNode;
  menuItem: ReactNode;
  /** Higher priority stays visible longer when horizontal space is tight. */
  keepPriority?: number;
};

const HEADER_ACTION_ROW = "flex w-full min-w-0 flex-nowrap items-center justify-end gap-2";
const HEADER_MORE_BTN = cn(PORTAL_HEADER_ACTION_BTN, "max-lg:px-3 max-lg:text-base");

export function pickVisibleActions(actions: PortalAdaptiveHeaderAction[], fitCount: number): PortalAdaptiveHeaderAction[] {
  if (fitCount >= actions.length) return actions;
  if (fitCount <= 0) return [];

  const ranked = [...actions].sort((a, b) => {
    const priorityDelta = (b.keepPriority ?? 0) - (a.keepPriority ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    return actions.indexOf(a) - actions.indexOf(b);
  });
  const visibleIds = new Set(ranked.slice(0, fitCount).map((action) => action.id));
  return actions.filter((action) => visibleIds.has(action.id));
}

/**
 * Portal page title-band actions: fit as many inline actions as the row allows,
 * then tuck the rest plus any pinned items into a trailing … menu.
 */
export function PortalAdaptiveHeaderActions({
  actions,
  pinnedMenuItems = [],
  moreAriaLabel = "More actions",
  moreDataAttr,
  className,
}: {
  actions: PortalAdaptiveHeaderAction[];
  pinnedMenuItems?: ReactNode[];
  moreAriaLabel?: string;
  moreDataAttr?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fitCount, setFitCount] = useState(actions.length);

  const pinnedCount = pinnedMenuItems.length;
  const needsMoreMenu = useMemo(
    () => pinnedCount > 0 || fitCount < actions.length,
    [actions.length, fitCount, pinnedCount],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure || actions.length === 0) {
      setFitCount(actions.length);
      return;
    }

    const gap = 8;

    const sync = () => {
      const containerWidth = container.clientWidth;
      if (containerWidth <= 0) return;

      const buttons = [...measure.querySelectorAll<HTMLElement>("[data-portal-header-fit-action]")];
      const widths = buttons.map((node) => node.offsetWidth);
      if (widths.length === 0) return;

      const moreNode = measure.querySelector<HTMLElement>("[data-portal-header-fit-more]");
      const moreWidth = moreNode?.offsetWidth ?? 40;
      const alwaysNeedsMore = pinnedCount > 0;

      const fitCountFor = (reserveMore: boolean) => {
        let used = 0;
        let count = 0;
        for (let i = 0; i < widths.length; i++) {
          const width = widths[i] ?? 0;
          const gapBefore = count > 0 ? gap : 0;
          const itemsAfter = widths.length - i - 1;
          const moreReserve =
            reserveMore && (alwaysNeedsMore || itemsAfter > 0) ? gap + moreWidth : 0;
          if (used + gapBefore + width + moreReserve <= containerWidth) {
            used += gapBefore + width;
            count++;
          } else {
            break;
          }
        }
        return count;
      };

      let count = fitCountFor(false);
      if (alwaysNeedsMore || count < widths.length) {
        count = fitCountFor(true);
      }
      setFitCount(Math.max(0, Math.min(count, widths.length)));
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(container);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [actions, pinnedCount]);

  if (actions.length === 0 && pinnedCount === 0) return null;

  const visible = pickVisibleActions(actions, fitCount);
  const overflow = actions.filter((action) => !visible.some((item) => item.id === action.id));
  const showMoreMenu = needsMoreMenu && (overflow.length > 0 || pinnedCount > 0);

  return (
    <>
      <div
        ref={measureRef}
        className="pointer-events-none invisible absolute left-0 top-0 -z-10 flex gap-2"
        aria-hidden
      >
        {actions.map((action) => (
          <div key={action.id} data-portal-header-fit-action>
            {action.node}
          </div>
        ))}
        <div data-portal-header-fit-more>
          <Button type="button" variant="outline" className={HEADER_MORE_BTN} tabIndex={-1}>
            …
          </Button>
        </div>
      </div>
      <div ref={containerRef} className={cn(HEADER_ACTION_ROW, className)}>
        {visible.map((action) => (
          <div key={action.id} className="shrink-0">
            {action.node}
          </div>
        ))}
        {showMoreMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={HEADER_MORE_BTN}
                data-attr={moreDataAttr}
                aria-label={moreAriaLabel}
              >
                …
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" backdrop>
              {overflow.map((action) => (
                <div key={action.id}>{action.menuItem}</div>
              ))}
              {overflow.length > 0 && pinnedCount > 0 ? <DropdownMenuSeparator /> : null}
              {pinnedMenuItems.map((item, index) => (
                <div key={index}>{item}</div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </>
  );
}
