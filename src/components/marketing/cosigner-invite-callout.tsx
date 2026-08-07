"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildCosignerApplyPath } from "@/lib/rental-application/cosigner-apply-link";

export function CosignerInviteCallout({
  signerAppId,
  signerName,
  className,
}: {
  signerAppId: string;
  signerName?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const invitePath = buildCosignerApplyPath(signerAppId);
  const inviteUrl =
    typeof window !== "undefined" ? `${window.location.origin}${invitePath}` : invitePath;

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
      <p className="text-[13px] font-semibold text-foreground">Invite your co-signer</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted sm:text-sm">
        Share this link so they can complete the co-signer form. Their application will open with your
        {signerName ? ` (${signerName})` : ""} application ID already filled in.
      </p>
      <p className="mt-2 font-mono text-xs text-muted">Your application ID: {signerAppId}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-[11px] text-foreground sm:text-[12px]">
          {inviteUrl}
        </code>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full px-4 text-xs"
            data-attr="cosigner-invite-copy"
            onClick={() => void copy()}
          >
            {copied ? "Copied" : "Copy invite link"}
          </Button>
          <Link
            href={invitePath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-background px-4 text-xs font-semibold text-foreground hover:bg-accent/40"
            data-attr="cosigner-invite-open"
          >
            Open co-signer form
          </Link>
        </div>
      </div>
    </div>
  );
}
