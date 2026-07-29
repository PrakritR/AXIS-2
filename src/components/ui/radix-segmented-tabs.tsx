"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Local-state segmented tabs (Radix Tabs) — keyboard, focus, and ARIA behaviour.
 * For routed section switches use {@link DestinationNav} instead.
 */
export function RadixSegmentedTabs({
  items,
  activeId,
  onChange,
  ariaLabel = "Section views",
  className,
}: {
  items: { id: string; label: string; dataAttr?: string }[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Tabs.Root value={activeId} onValueChange={onChange}>
      <Tabs.List
        aria-label={ariaLabel}
        className={cn(
          "flex w-full max-w-full flex-wrap gap-1 rounded-full border border-border bg-accent/30 p-1",
          className,
        )}
      >
        {items.map((item) => (
          <Tabs.Trigger
            key={item.id}
            value={item.id}
            data-attr={item.dataAttr}
            className={cn(
              "min-w-0 flex-1 basis-0 rounded-full px-3 py-1.5 text-center text-sm font-semibold transition-colors min-h-11",
              "text-muted data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[var(--shadow-sm)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
