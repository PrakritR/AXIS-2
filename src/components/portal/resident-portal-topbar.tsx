"use client";

export function ResidentPortalTopbar({ displayName }: { displayName: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-2.5 lg:px-8">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Resident</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{displayName}</p>
        </div>
        <div
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200/90 bg-slate-50/90 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/35 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Syncing
        </div>
      </div>
    </header>
  );
}
