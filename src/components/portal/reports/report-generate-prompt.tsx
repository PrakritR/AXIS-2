"use client";

import { PORTAL_DATA_TABLE_WRAP } from "@/components/portal/portal-data-table";
import { PortalEmptyState } from "@/components/portal/portal-empty-state";

export function ReportGeneratePrompt({
  title = "No documents yet.",
  loading = false,
  loadingTitle = "Generating…",
}: {
  title?: string;
  /** @deprecated Use loading instead. */
  description?: string;
  loading?: boolean;
  loadingTitle?: string;
}) {
  if (loading) {
    return (
      <div className={PORTAL_DATA_TABLE_WRAP}>
        <div className="flex items-center justify-center px-6 py-16 text-sm text-muted">{loadingTitle}</div>
      </div>
    );
  }

  return <PortalEmptyState title={title} icon="document" />;
}
