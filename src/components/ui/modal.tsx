"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

export function Modal({
  open,
  title,
  onClose,
  children,
  panelClassName,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Override default panel width (e.g. wide onboarding / payouts). */
  panelClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6 sm:py-8">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={
          panelClassName ??
          "relative z-[71] max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
        }
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <h3 className="min-w-0 text-lg font-semibold text-slate-950">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto pt-4">{children}</div>
      </div>
    </div>
  );
}
