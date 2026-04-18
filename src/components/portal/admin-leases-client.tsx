"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  adminLeaseKpiCounts,
  filterAdminLeases,
  readAdminLeases,
  uniqueManagerNames,
  uniquePropertyGroups,
  updateAdminLease,
  type AdminLeaseBucketIndex,
  type AdminLeaseRow,
} from "@/lib/demo-admin-leases";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import {
  PORTAL_PAGE_TITLE,
  PORTAL_SECTION_SURFACE,
  PortalContentWell,
  PortalKpiTabStrip,
} from "@/components/portal/portal-metrics";

const KPI_LABELS = ["Manager review", "Admin review", "With resident", "Signed"] as const;

function DocIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8" />
    </svg>
  );
}

function StatusPill({ bucket }: { bucket: AdminLeaseBucketIndex }) {
  const map: Record<AdminLeaseBucketIndex, { label: string; cls: string; dot: string }> = {
    0: {
      label: "Manager review",
      cls: "border-amber-200/90 bg-amber-50 text-amber-950",
      dot: "bg-amber-500",
    },
    1: {
      label: "Admin review",
      cls: "border-sky-200/90 bg-sky-50 text-sky-950",
      dot: "bg-sky-500",
    },
    2: {
      label: "With resident",
      cls: "border-violet-200/90 bg-violet-50 text-violet-950",
      dot: "bg-violet-500",
    },
    3: {
      label: "Signed",
      cls: "border-emerald-200/90 bg-emerald-50 text-emerald-900",
      dot: "bg-emerald-500",
    },
  };
  const s = map[bucket];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

function LeaseDetailSheet({
  open,
  onClose,
  row,
  onSaved,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  row: AdminLeaseRow | null;
  onSaved: () => void;
  showToast: (m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [comments, setComments] = useState("");

  useEffect(() => {
    if (row) setComments(row.comments);
  }, [row]);

  if (!open || !row) return null;

  const pdfSrc = row.uploadedPdfDataUrl ?? row.pdfUrl;

  const saveComments = () => {
    const next = comments.trim();
    if (updateAdminLease(row.id, { comments: next })) {
      showToast("Comments saved.");
      onSaved();
    } else showToast("Could not save comments.");
  };

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      showToast("Please choose a PDF file.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      showToast("File too large (max 3 MB in this demo).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result;
      if (typeof data !== "string") return;
      if (updateAdminLease(row.id, { uploadedPdfDataUrl: data })) {
        showToast("Lease file updated.");
        onSaved();
      } else showToast("Could not save file.");
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]"
        aria-label="Close details"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200/90 bg-white shadow-[0_0_48px_-12px_rgba(15,23,42,0.2)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-lease-detail-title"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="admin-lease-detail-title" className="text-lg font-semibold text-slate-900">
            Lease
          </h2>
          <Button type="button" variant="ghost" className="rounded-full px-3 py-1.5 text-sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <p className="text-base font-semibold text-slate-900">{row.propertyLabel}</p>
            <p className="mt-0.5 text-sm text-slate-500">{row.addressLine}</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">{row.rentLabel}</p>
            <p className="mt-1 text-xs text-slate-500">
              {row.residentName} · {row.managerName}
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/50">
            <p className="border-b border-slate-200/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Lease PDF
            </p>
            {pdfSrc ? (
              <iframe
                title="Lease PDF preview"
                src={pdfSrc}
                className="h-[min(52vh,420px)] w-full bg-white"
              />
            ) : (
              <div className="flex h-[min(52vh,420px)] items-center justify-center px-4 text-center text-sm text-slate-500">
                No PDF on file.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={pdfSrc}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex items-center justify-center rounded-full border border-black/[0.1] bg-white/80 px-5 py-2.5 text-[14px] font-semibold text-[#1d1d1f] shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
            >
              Download
            </a>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onPickFile} />
            <Button type="button" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()}>
              Upload new lease
            </Button>
            <Button
              type="button"
              className="rounded-full"
              onClick={() => {
                showToast(`Sent to ${row.managerName}.`);
              }}
            >
              Send to manager
            </Button>
          </div>

          <div>
            <label htmlFor="lease-comments" className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Comments
            </label>
            <textarea
              id="lease-comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Internal notes…"
            />
            <Button type="button" variant="outline" className="mt-2 rounded-full" onClick={saveComments}>
              Save comments
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

export function AdminLeasesClient() {
  const { showToast } = useAppUi();
  const [activeBucket, setActiveBucket] = useState<AdminLeaseBucketIndex>(0);
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [tick, setTick] = useState(0);
  const [detailRow, setDetailRow] = useState<AdminLeaseRow | null>(null);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    showToast("Refreshed leases.");
  }, [showToast]);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const allRows = useMemo(() => readAdminLeases(), [tick]);
  const kpiValues = useMemo(() => adminLeaseKpiCounts(), [tick]);
  const propertyOptions = useMemo(() => uniquePropertyGroups(allRows), [allRows]);
  const managerOptions = useMemo(() => uniqueManagerNames(allRows), [allRows]);

  const rows = useMemo(
    () => filterAdminLeases(allRows, activeBucket, propertyFilter, managerFilter, ""),
    [allRows, activeBucket, propertyFilter, managerFilter],
  );

  const kpiItems = useMemo(
    () => KPI_LABELS.map((label, i) => ({ value: String(kpiValues[i] ?? 0), label })),
    [kpiValues],
  );

  useEffect(() => {
    if (!detailRow) return;
    const next = readAdminLeases().find((r) => r.id === detailRow.id);
    if (next) setDetailRow(next);
  }, [tick, detailRow?.id]);

  return (
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <h1 className={PORTAL_PAGE_TITLE}>Leases</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
          <select
            aria-label="Managers"
            className="w-full min-w-[10rem] rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-auto sm:max-w-[min(100%,14rem)]"
            value={managerFilter}
            onChange={(e) => setManagerFilter(e.target.value)}
          >
            <option value="all">All managers</option>
            {managerOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            aria-label="Properties"
            className="w-full min-w-[10rem] rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-auto sm:max-w-[min(100%,14rem)]"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
          >
            <option value="all">All properties</option>
            {propertyOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      <PortalKpiTabStrip
        items={kpiItems}
        activeIndex={activeBucket}
        onSelect={(i) => setActiveBucket(i as AdminLeaseBucketIndex)}
        textAlign="left"
      />

      <PortalContentWell>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <AxisHeaderMarkTile>
              <DocIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 text-sm font-medium text-slate-500">
              {allRows.length === 0
                ? "No leases yet"
                : "No leases in this bucket for the selected property and manager."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200/90 bg-white">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Lease
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Rent
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-4 align-middle">
                      <p className="font-semibold text-slate-900">{row.propertyLabel}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{row.addressLine}</p>
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <p className="font-semibold text-slate-900">{row.rentLabel}</p>
                    </td>
                    <td className="px-5 py-4 align-middle">
                      <StatusPill bucket={row.bucket} />
                    </td>
                    <td className="px-5 py-4 text-right align-middle">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                        onClick={() => setDetailRow(row)}
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PortalContentWell>

      <LeaseDetailSheet
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        row={detailRow}
        onSaved={() => setTick((t) => t + 1)}
        showToast={showToast}
      />
    </div>
  );
}
