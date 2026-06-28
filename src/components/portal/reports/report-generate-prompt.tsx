"use client";

import { PORTAL_DATA_TABLE_WRAP } from "@/components/portal/portal-data-table";

export function ReportGeneratePrompt({
  title = "Ready to generate",
  description = "Choose your filters, then click Generate report to build this document. Nothing is fetched until you request it.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-muted">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      </div>
    </div>
  );
}
