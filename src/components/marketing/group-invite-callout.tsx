"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildGroupApplyPath } from "@/lib/rental-application/group-apply-link";

export function GroupInviteCallout({
  leaderAppId,
  groupSize,
  organizerName,
  propertyId,
  className,
  pendingSubmit = false,
}: {
  leaderAppId: string;
  groupSize?: string;
  organizerName?: string;
  propertyId?: string;
  className?: string;
  /** Wizard step — link is shown early but only works after the organizer submits. */
  pendingSubmit?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const invitePath = buildGroupApplyPath(leaderAppId, { propertyId });
  const inviteUrl =
    typeof window !== "undefined" ? `${window.location.origin}${invitePath}` : invitePath;
  const size = Number.parseInt((groupSize ?? "").trim(), 10);
  const others = Number.isFinite(size) && size >= 2 ? size - 1 : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — link stays visible to copy manually.
    }
  };

  return (
    <div className={`text-left ${className ?? ""}`}>
      <p className="text-[13px] font-semibold text-foreground">Roommate invite</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted sm:text-sm">
        Share this link so each roommate can apply on their own
        {organizerName ? ` and join ${organizerName}'s group` : ""}.
        {others != null
          ? ` You declared ${size} people — send this to ${others} ${others === 1 ? "roommate" : "roommates"}.`
          : null}
      </p>
      {pendingSubmit ? (
        <p className="mt-2 text-[12px] font-medium text-amber-800 [html[data-theme=dark]_&]:text-amber-200">
          The link works only after you finish and submit this application.
        </p>
      ) : null}
      <p className="mt-2 font-mono text-xs text-muted">Application ID: {leaderAppId}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-[11px] text-foreground">
          {inviteUrl}
        </code>
        <Button
          type="button"
          variant="outline"
          className="h-9 shrink-0 rounded-full px-4 text-xs"
          data-attr="group-invite-copy"
          onClick={() => void copy()}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
