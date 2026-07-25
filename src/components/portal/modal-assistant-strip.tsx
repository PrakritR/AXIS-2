"use client";

import { AssistantDockPanel } from "@/components/portal/assistant-dock-panel";
import { AxisAssistantSparkleIcon } from "@/components/portal/assistant-shared";
import { AssistantConversationProvider } from "@/lib/axis-assistant/assistant-conversation-context";
import { modalAssistantStorageScope } from "@/lib/axis-assistant/assistant-chat-storage";
import { usePortalAssistantConfig } from "@/lib/axis-assistant/portal-assistant-context";

export type ModalAssistantStripProps = {
  contextHint?: string | null;
  /**
   * Stable scope key for this modal surface (e.g. "New promotion"), without step
   * labels. Defaults to contextHint.
   */
  storageScopeKey?: string | null;
  /**
   * Bumped when the modal opens so each visit starts a fresh thread (saved under
   * its own scope). Main popup/dock history is unchanged.
   */
  conversationInstance?: number;
};

/**
 * Compact assistant input strip for portal modals — scoped to the modal title
 * so the agent knows what surface the manager is working in.
 */
export function ModalAssistantStrip({
  contextHint,
  storageScopeKey,
  conversationInstance = 0,
}: ModalAssistantStripProps) {
  const config = usePortalAssistantConfig();
  if (!config) return null;

  const scopeSource = (storageScopeKey ?? contextHint ?? "Portal modal").trim();
  const storageScope = modalAssistantStorageScope(scopeSource, conversationInstance);

  return (
    <AssistantConversationProvider endpoint={config.endpoint} storageScope={storageScope}>
      <div className="mt-3 shrink-0 border-t border-border pt-3" data-attr="modal-assistant-strip">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary">
          <AxisAssistantSparkleIcon className="h-4 w-4 shrink-0" />
          PropLane Assistant
        </p>
        <AssistantDockPanel
          managerName={config.managerName}
          endpoint={config.endpoint}
          contextHint={contextHint}
          compact
        />
      </div>
    </AssistantConversationProvider>
  );
}
