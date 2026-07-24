"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { AssistantDockPanel } from "@/components/portal/assistant-dock-panel";
import { AxisAssistantSparkleIcon } from "@/components/portal/assistant-shared";
import { useIsSmallPortalViewport } from "@/hooks/use-is-native-app";
import {
  getAssistantDockCollapsed,
  initAssistantDockCollapsed,
  subscribeAssistantDockCollapsed,
  toggleAssistantDock,
} from "@/lib/axis-assistant/dock-store";
import { cn } from "@/lib/utils";

function useAssistantDockCollapsed(initialCollapsed: boolean) {
  const collapsed = useSyncExternalStore(
    subscribeAssistantDockCollapsed,
    getAssistantDockCollapsed,
    () => initialCollapsed,
  );

  useEffect(() => {
    initAssistantDockCollapsed(initialCollapsed);
  }, [initialCollapsed]);

  return collapsed;
}

/**
 * Desktop right rail — mirrors the left nav sidebar: expanded chat panel by
 * default, collapses to a narrow icon column. Hidden below `lg` (FAB + popup).
 */
export function PortalAssistantRail({
  managerName,
  endpoint = "/api/agent/chat",
  initialCollapsed = false,
}: {
  managerName?: string | null;
  endpoint?: string;
  initialCollapsed?: boolean;
}) {
  const isSmall = useIsSmallPortalViewport();
  const collapsed = useAssistantDockCollapsed(initialCollapsed);

  if (isSmall) return null;

  return (
    <aside
      className={cn(
        "portal-assistant-rail relative z-30 hidden h-full min-h-0 shrink-0 self-stretch flex-col overflow-hidden border-l border-border bg-background lg:flex",
        collapsed ? "w-[58px]" : "w-[min(22rem,28vw)]",
      )}
      data-attr="portal-assistant-rail"
      aria-label="PropLane Assistant"
    >
      {collapsed ? (
        <div className="flex h-full flex-col items-center py-2">
          <button
            type="button"
            onClick={toggleAssistantDock}
            aria-label="Expand PropLane Assistant"
            aria-expanded={false}
            className="grid h-8 w-8 place-items-center rounded-[8px] text-muted transition-colors duration-150 hover:bg-[var(--secondary)]/60 hover:text-foreground"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggleAssistantDock}
            aria-label="Open PropLane Assistant"
            className="mt-3 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform hover:scale-105"
          >
            <AxisAssistantSparkleIcon className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-2 pt-0">
          <AssistantDockPanel
            managerName={managerName}
            endpoint={endpoint}
            onCollapse={toggleAssistantDock}
            className="h-full"
          />
        </div>
      )}
    </aside>
  );
}
