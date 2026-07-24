"use client";

import { AssistantDockPanel } from "@/components/portal/assistant-dock-panel";
import { usePortalAssistantConfig } from "@/lib/axis-assistant/portal-assistant-context";

/**
 * Compact assistant input strip for portal modals — scoped to the modal title
 * so the agent knows what surface the manager is working in.
 */
export function ModalAssistantStrip({ contextHint }: { contextHint?: string | null }) {
  const config = usePortalAssistantConfig();
  if (!config) return null;

  return (
    <div className="mt-3 border-t border-border pt-3" data-attr="modal-assistant-strip">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">PropLane Assistant</p>
      <AssistantDockPanel
        managerName={config.managerName}
        endpoint={config.endpoint}
        contextHint={contextHint}
        compact
      />
    </div>
  );
}
