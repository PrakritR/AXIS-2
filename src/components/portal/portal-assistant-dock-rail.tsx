"use client";

import { AssistantDock } from "@/components/portal/assistant-dock";
import { useAxisAssistantDock } from "@/components/portal/axis-assistant";

/**
 * Full-height right-side assistant rail for the manager portal shell.
 *
 * Renders NOTHING unless the manager explicitly switched the assistant into
 * docked mode (`popup` is the default) and this portal opted in via
 * `<AxisAssistant dockable>`. Mounted as the last flex child of the portal
 * shell's `lg:flex-row`, so when it is on it pins to the right edge and spans
 * the full height beside every section — not just the dashboard — while the
 * content column keeps the reclaimed width whenever it is off.
 *
 * `hidden lg:flex`: below `lg` there is no room for a rail, so the FAB/popup
 * stays the assistant regardless of the saved mode.
 */
export function PortalAssistantDockRail({ managerName }: { managerName?: string | null }) {
  const { dockable, mode, setMode } = useAxisAssistantDock();
  if (!dockable || mode !== "docked") return null;

  return (
    <aside
      className="hidden shrink-0 border-l border-border/70 bg-background/40 p-3 lg:flex lg:w-[21rem] xl:w-[23rem]"
      aria-label="PropLane Assistant"
      data-attr="portal-assistant-dock-rail"
    >
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <AssistantDock managerName={managerName} onUnpin={() => setMode("popup")} />
      </div>
    </aside>
  );
}
