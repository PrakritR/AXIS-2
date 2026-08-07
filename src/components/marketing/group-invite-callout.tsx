"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildGroupApplyPath } from "@/lib/rental-application/group-apply-link";

export function GroupInviteCallout({
  leaderAppId,
  groupSize,
  organizerName,
  propertyId,
  className,
}: {
  leaderAppId: string;
  groupSize?: string;
  organizerName?: string;
  propertyId?: string;
  className?: string;
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
      <p className="text-[13px] font-semibold text-foreground">Invite your roommates</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted sm:text-sm">
        Share this link so each roommate can apply on their own. Their application opens already linked to yours
        {organizerName ? ` (${organizerName})` : ""}.
        {others != null
          ? ` You declared ${size} people total — send it to ${others} ${others === 1 ? "roommate" : "roommates"}.`
          : null}
      </p>
      <p className="mt-2 font-mono text-xs text-muted">Your application ID: {leaderAppId}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-[11px] text-foreground sm:text-[12px]">
          {inviteUrl}
        </code>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full px-4 text-xs"
            data-attr="group-invite-copy"
            onClick={() => void copy()}
          >
            {copied ? "Copied" : "Copy invite link"}
          </Button>
          <Link
            href={invitePath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-background px-4 text-xs font-semibold text-foreground hover:bg-accent/40"
            data-attr="group-invite-open"
          >
            Preview roommate form
          </Link>
        </div>
      </div>
    </div>
  );
}
