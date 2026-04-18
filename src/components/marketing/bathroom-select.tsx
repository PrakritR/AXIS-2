"use client";

import { useEffect, useRef, useState } from "react";

const OPTIONS = [
  { id: "any", label: "Any" },
  { id: "private", label: "Private bath" },
  { id: "2-share", label: "2-share" },
  { id: "3-share", label: "3-share" },
  { id: "4-share", label: "4-share" },
] as const;

export function BathroomSelect() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<(typeof OPTIONS)[number]["id"]>("any");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const label = OPTIONS.find((o) => o.id === value)?.label ?? "Any";

  return (
    <div ref={rootRef} className="relative min-w-0">
      <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Bathroom type
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex w-full items-center justify-between gap-2 rounded-2xl border-2 border-[#2b5ce7] bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-900 shadow-sm outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#2b5ce7]/40"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl bg-[#4a4a4a] py-1 shadow-xl ring-1 ring-black/10"
        >
          {OPTIONS.map((opt) => {
            const selected = opt.id === value;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setValue(opt.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition ${
                    selected
                      ? "bg-[#2b5ce7] text-white"
                      : "text-white/95 hover:bg-white/10"
                  }`}
                >
                  {selected ? (
                    <span className="text-white" aria-hidden>
                      ✓
                    </span>
                  ) : (
                    <span className="w-4 shrink-0" aria-hidden />
                  )}
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
