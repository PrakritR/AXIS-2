"use client";

import { useSyncExternalStore } from "react";

import {
  PortalSettingsGroup,
  PortalSettingsRow,
  PortalSettingsSection,
} from "@/components/portal/portal-settings-ui";
import {
  dockAssistantToRail,
  getAssistantDocked,
  subscribeAssistantDocked,
  undockAssistantFromRail,
} from "@/lib/axis-assistant/dock-store";
import { useIsSmallPortalViewport } from "@/hooks/use-is-native-app";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { cn } from "@/lib/utils";

/** Reactive read of the shipped "pinned to the right rail" preference. */
function useAssistantDocked() {
  return useSyncExternalStore(subscribeAssistantDocked, getAssistantDocked, () => false);
}

const OPTIONS: { docked: boolean; label: string; description: string }[] = [
  {
    docked: false,
    label: "Floating popup",
    description: "A button in the corner opens the assistant over your work.",
  },
  {
    docked: true,
    label: "Pinned to the right",
    description: "A full-height panel stays open beside the portal on wide screens.",
  },
];

/**
 * Settings entry point for the assistant display mode, on the manager Settings
 * page. It is the third control over the SAME shipped preference the in-assistant
 * pin (`AssistantDockToRailButton` → `dockAssistantToRail`) and the rail's unpin
 * (`AssistantUndockToPopupButton` → `undockAssistantFromRail`) already drive, so
 * choosing here and choosing in the assistant stay in lockstep through
 * `dock-store` and its cookie. This adds no send/execute path — it only flips
 * which surface the assistant renders as.
 *
 * Hidden in the /demo sandbox (its scripted assistant must not gain the live
 * docked surface). The rail itself is desktop-only (`useIsSmallPortalViewport`
 * hides it below `lg`), so on a small screen the picker still writes the
 * preference but explains that the popup is used until there is room for a rail.
 */
export function AssistantDisplaySetting() {
  const docked = useAssistantDocked();
  const isSmall = useIsSmallPortalViewport();

  if (isDemoModeActive()) return null;

  return (
    <PortalSettingsSection
      title="PropLane Assistant"
      description="Choose how the AI assistant appears in the portal."
    >
      <PortalSettingsGroup>
        <PortalSettingsRow
          label="Display"
          description={
            isSmall
              ? "On this screen the assistant is always the floating popup — there is no room for a side panel."
              : docked
                ? "Pinned to the right side of the portal."
                : "Opens as a floating popup from the corner button."
          }
        >
          <div
            role="radiogroup"
            aria-label="Assistant display"
            className="flex flex-col gap-2 sm:flex-row"
          >
            {OPTIONS.map((option) => {
              const selected = docked === option.docked;
              return (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={option.description}
                  onClick={() => (option.docked ? dockAssistantToRail() : undockAssistantFromRail())}
                  data-attr={`assistant-display-${option.docked ? "docked" : "popup"}`}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25",
                    selected
                      ? "border-primary/50 bg-primary/5 text-foreground"
                      : "border-border text-muted hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </PortalSettingsRow>
      </PortalSettingsGroup>
    </PortalSettingsSection>
  );
}
