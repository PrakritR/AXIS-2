"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

import { AssistantDockPanel } from "@/components/portal/assistant-dock-panel";
import { AxisAssistantSparkleIcon } from "@/components/portal/assistant-shared";
import { AssistantConversationProvider } from "@/lib/axis-assistant/assistant-conversation-context";
import { modalAssistantStorageScope } from "@/lib/axis-assistant/assistant-chat-storage";
import { usePortalAssistantConfig } from "@/lib/axis-assistant/portal-assistant-context";
import { cn } from "@/lib/utils";

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
  className?: string;
};

/**
 * Compact assistant input strip for portal modals — scoped to the modal title
 * so the agent knows what surface the manager is working in.
 *
 * Collapsed by default so form fields keep the full scroll area; managers expand
 * when they want help.
 */
export function ModalAssistantStrip({
  contextHint,
  storageScopeKey,
  conversationInstance = 0,
  className,
}: ModalAssistantStripProps) {
  const config = usePortalAssistantConfig();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [conversationInstance]);

  if (!config) return null;

  const scopeSource = (storageScopeKey ?? contextHint ?? "Portal modal").trim();
  const storageScope = modalAssistantStorageScope(scopeSource, conversationInstance);

  return (
    <AssistantConversationProvider endpoint={config.endpoint} storageScope={storageScope}>
      <div
        className={cn("shrink-0 border-t border-border bg-card", className)}
        data-attr="modal-assistant-strip"
        data-expanded={expanded ? "true" : "false"}
      >
        {expanded ? (
          <div className="px-0 pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-primary">
                <AxisAssistantSparkleIcon className="h-4 w-4 shrink-0" />
                PropLane Assistant
              </p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-foreground/5 hover:text-foreground"
                data-attr="modal-assistant-collapse"
                aria-expanded
              >
                Hide
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <AssistantDockPanel
              managerName={config.managerName}
              endpoint={config.endpoint}
              contextHint={contextHint}
              compact
              className="max-h-[min(36vh,17rem)]"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex w-full items-center justify-between gap-2 py-3 text-left text-sm transition hover:bg-foreground/[0.02]"
            data-attr="modal-assistant-expand"
            aria-expanded={false}
          >
            <span className="flex min-w-0 items-center gap-1.5 font-semibold text-primary">
              <AxisAssistantSparkleIcon className="h-4 w-4 shrink-0" />
              Ask PropLane Assistant
            </span>
            <ChevronUp className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          </button>
        )}
      </div>
    </AssistantConversationProvider>
  );
}
