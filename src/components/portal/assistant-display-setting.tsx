"use client";

import { useCallback, useId, useRef, type KeyboardEvent } from "react";

import {
  PortalSettingsGroup,
  PortalSettingsRow,
  PortalSettingsSection,
} from "@/components/portal/portal-settings-ui";
import {
  dockAssistantToRail,
  undockAssistantFromRail,
  useAssistantDocked,
} from "@/lib/axis-assistant/dock-store";
import { useIsSmallPortalViewport } from "@/hooks/use-is-native-app";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { cn } from "@/lib/utils";

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

function selectOption(docked: boolean) {
  if (docked) dockAssistantToRail();
  else undockAssistantFromRail();
}

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
  const groupId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();

    const current = optionRefs.current.findIndex((node) => node === document.activeElement);
    const from = current === -1 ? OPTIONS.findIndex((option) => option.docked === docked) : current;
    const next = (from + step + OPTIONS.length) % OPTIONS.length;
    selectOption(OPTIONS[next].docked);
    optionRefs.current[next]?.focus();
  }, [docked]);

  if (isDemoModeActive()) return null;

  return (
    <PortalSettingsSection
      title="PropLane Assistant"
      description="Choose how the AI assistant appears in the portal."
    >
      <PortalSettingsGroup>
        <PortalSettingsRow
          className="flex-col items-start gap-3 sm:flex-row sm:items-center"
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
            onKeyDown={onKeyDown}
            className="flex flex-col gap-2 sm:flex-row"
          >
            {OPTIONS.map((option, index) => {
              const selected = docked === option.docked;
              const labelId = `${groupId}-${index}-label`;
              const descriptionId = `${groupId}-${index}-description`;
              return (
                <button
                  key={option.label}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-labelledby={labelId}
                  aria-describedby={descriptionId}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectOption(option.docked)}
                  data-attr={`assistant-display-${option.docked ? "docked" : "popup"}`}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 sm:max-w-[15rem]",
                    selected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:border-primary/30",
                  )}
                >
                  <span
                    id={labelId}
                    className={cn(
                      "block text-sm font-medium",
                      selected ? "text-foreground" : "text-muted",
                    )}
                  >
                    {option.label}
                  </span>
                  <span id={descriptionId} className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </PortalSettingsRow>
      </PortalSettingsGroup>
    </PortalSettingsSection>
  );
}
