"use client";

import type { ReactNode } from "react";
import { PortalDetailHeader } from "@/components/portal/portal-list-detail-shell";
import { usePortalNavigate } from "@/lib/portal-nav-client";

/**
 * Full-page record detail (Appendix E2) — no split list pane; URL is the record route.
 */
export function PortalRecordDetailPage({
  pageTitle: _pageTitle,
  title,
  subtitle,
  avatarName,
  backHref,
  backLabel,
  actions,
  children,
  dataAttrBack = "portal-record-detail-back",
}: {
  /** @deprecated Detail chrome no longer renders a duplicate section title. */
  pageTitle?: string;
  title: string;
  subtitle?: string;
  avatarName?: string;
  backHref: string;
  backLabel: string;
  actions?: ReactNode;
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
        onBack={() => navigate(backHref)}
        backLabel={backLabel}
        dataAttrBack={dataAttrBack}
        actions={actions}
      />
      <div className="min-h-0 flex-1 px-0 py-2 md:px-2 md:py-3">{children}</div>
    </div>
  );
}
