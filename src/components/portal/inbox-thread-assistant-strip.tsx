"use client";

import { ModalAssistantStrip } from "@/components/portal/modal-assistant-strip";

export function buildInboxThreadAssistantContext({
  subject,
  email,
  from,
  sentSemantics = false,
}: {
  subject?: string;
  email?: string;
  from?: string;
  sentSemantics?: boolean;
}): string {
  const party = sentSemantics ? email || "recipient" : from || email || "sender";
  const direction = sentSemantics ? "To" : "From";
  const subjectBit = subject?.trim() ? ` · Subject: ${subject.trim()}` : "";
  return `Communication thread · ${direction}: ${party}${subjectBit}`;
}

/** Collapsible PropLane Assistant directly above the thread reply composer. */
export function InboxThreadAssistantStrip({
  contextHint,
  storageScopeKey = "Communication thread",
}: {
  contextHint: string;
  storageScopeKey?: string;
}) {
  if (!contextHint.trim()) return null;
  return (
    <ModalAssistantStrip
      contextHint={contextHint}
      storageScopeKey={storageScopeKey}
      className="shrink-0 bg-card px-1 md:px-2"
    />
  );
}
