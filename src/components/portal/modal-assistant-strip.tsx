"use client";

import { useEffect } from "react";
import { AssistantDockPanel } from "@/components/portal/assistant-dock-panel";
import { usePortalAssistantConfig } from "@/lib/axis-assistant/portal-assistant-context";

/**
 * Compact assistant input strip for portal modals — scoped to the modal title
 * so the agent knows what surface the manager is working in.
 */
export function ModalAssistantStrip({ contextHint }: { contextHint?: string | null }) {
  const config = usePortalAssistantConfig();
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7293/ingest/77aa960a-bec3-48b1-bf3d-3eb4c10cfddf',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'81cbea'},body:JSON.stringify({sessionId:'81cbea',location:'modal-assistant-strip.tsx',message:'modal strip mount',data:{hasConfig:config!=null,contextHint:contextHint??null},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
  }, [config, contextHint]);
  // #endregion
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
