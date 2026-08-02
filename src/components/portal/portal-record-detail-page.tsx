"use client";

import type { ReactNode } from "react";
import { PortalDetailHeader } from "@/components/portal/portal-list-detail-shell";
import { usePortalNavigate } from "@/lib/portal-nav-client";

/**
 * Full-page record detail (Appendix E2) — no split list pane; URL is the lease route.
 */
export function PortalRecordDetailPage({
  pageTitle: _pageTitle,
  title,
  subtitle,
  avatarName,
  backHref,
  backLabel,
  hideBackText = false,
  hideBack = false,
  bareHeader = false,
  actions,
  suppressMobileActions = false,
  inlineActions = false,
  inlineActionsClassName,
  children,
  dataAttrBack = "portal-record-detail-back",
}: {
  /** @deprecated Detail chrome no longer renders a duplicate section title. */
  pageTitle?: string;
  title: string;
  subtitle?: string;
  avatarName?: string;
  backHref?: string;
  backLabel?: string;
  hideBackText?: boolean;
  /** Omit the back control entirely (detail stays in-context). */
  hideBack?: boolean;
  bareHeader?: boolean;
  actions?: ReactNode;
  suppressMobileActions?: boolean;
  inlineActions?: boolean;
  inlineActionsClassName?: string;
  children: ReactNode;
  dataAttrBack?: string;
}) {
  const navigate = usePortalNavigate();
  return (
    <div className="flex min-h-0 flex-col">
      <PortalDetailHeader
        title={title}
        subtitle={subtitle}
        avatarName={avatarName}
        onBack={hideBack || !backHref ? undefined : () => navigate(backHref)}
        backLabel={backLabel ?? "Back"}
        hideBackText={hideBackText}
        bare={bareHeader}
        dataAttrBack={dataAttrBack}
        actions={actions}
        suppressMobileActions={suppressMobileActions}
        inlineActions={inlineActions}
        inlineActionsClassName={inlineActionsClassName}
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
