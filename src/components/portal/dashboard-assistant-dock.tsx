"use client";

import { AssistantDockPanel } from "@/components/portal/assistant-dock-panel";

/** @deprecated Use portal-wide {@link PortalAssistantRail} on desktop. Kept for tests. */
export function DashboardAssistantDock({
  managerName,
  endpoint = "/api/agent/chat",
}: {
  managerName?: string | null;
  endpoint?: string;
}) {
  return <AssistantDockPanel managerName={managerName} endpoint={endpoint} />;
}
