"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-y-auto">
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[71] flex min-h-screen items-center justify-center px-2 py-4 sm:px-4 sm:py-6">
        <div
          className={
            panelClassName ??
            "relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
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
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto pt-4 sm:max-h-[calc(100vh-9rem)]">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
