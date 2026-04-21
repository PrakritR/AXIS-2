import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

type Props = {
  row: LeasePipelineRow;
  /** Shown when there is no PDF and no generated HTML */
  emptyHint?: string;
  className?: string;
};

/**
 * In-portal preview of the manager-uploaded PDF, AI-generated lease HTML, or empty state.
 */
export function LeaseDocumentPreview({ row, emptyHint, className }: Props) {
  const pdfSrc = row.managerUploadedPdf?.dataUrl ?? null;
  const defaultEmpty =
    emptyHint ??
    "No lease document yet — click Generate lease (from application data) or upload a PDF to preview it here.";

  return (
    <div className={`mt-4 overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/50 ${className ?? ""}`}>
      <p className="border-b border-slate-200/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
        Lease document
      </p>
      {pdfSrc ? (
        <iframe title="Lease PDF preview" src={pdfSrc} className="h-[min(52vh,420px)] w-full bg-white" />
      ) : row.generatedHtml ? (
        <iframe
          title="AI-generated lease"
          srcDoc={row.generatedHtml}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="h-[min(52vh,420px)] w-full bg-white"
        />
      ) : (
        <div className="flex h-[min(36vh,280px)] items-center justify-center px-4 text-center text-sm text-slate-500">
          {defaultEmpty}
        </div>
      )}
    </div>
  );
}
