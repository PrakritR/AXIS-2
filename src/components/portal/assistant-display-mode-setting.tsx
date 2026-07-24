"use client";

import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { useAxisAssistantDock } from "@/components/portal/axis-assistant";
import type { AssistantDisplayMode } from "@/lib/assistant-display-preferences";
import { cn } from "@/lib/utils";

const OPTIONS: { mode: AssistantDisplayMode; label: string; description: string }[] = [
  {
    mode: "popup",
    label: "Floating popup",
    description: "A button in the corner opens the assistant over your work.",
  },
  {
    mode: "docked",
    label: "Pinned to the right",
    description: "A full-height panel stays open beside the portal on wide screens.",
  },
];

/**
 * Settings entry point for the assistant display mode. It writes the SAME
 * persisted preference as the popup's pin button and the dock's unpin button
 * (`useAxisAssistantDock`), so all three stay in sync.
 *
 * Renders nothing where the rail cannot be shown — other portals, the /demo
 * sandbox, or before the session resolves — rather than offering a setting that
 * would have no effect.
 */
export function AssistantDisplayModeSetting() {
  const { dockable, mode, setMode } = useAxisAssistantDock();
  if (!dockable) return null;

  return (
    <PortalCollapsibleSection
      title="PropLane Assistant"
      subtitle={
        mode === "docked"
          ? "Pinned to the right side of the portal on wide screens."
          : "Opens as a floating popup from the corner button."
      }
      surfaceMuted={false}
      contentClassName="px-4 pb-4"
      toggleDataAttr="portal-assistant-display-mode-toggle"
    >
      <div role="radiogroup" aria-label="Assistant display" className="flex flex-col gap-2 sm:flex-row">
        {OPTIONS.map((option) => {
          const selected = mode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(option.mode)}
              data-attr={`assistant-display-mode-${option.mode}`}
              className={cn(
                "flex-1 rounded-2xl border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25",
                selected
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-foreground/[0.03]",
              )}
            >
              <span className="block text-sm font-semibold text-foreground">{option.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{option.description}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">
        On phones and tablets the assistant is always the floating popup, since there is no room for
        a side panel.
      </p>
    </PortalCollapsibleSection>
  );
}
