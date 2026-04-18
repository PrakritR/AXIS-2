"use client";

export function ResidentPortalTopbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/90 backdrop-blur">
      <div className="flex items-start justify-between gap-4 px-4 py-4 lg:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold uppercase tracking-wide text-slate-900 sm:text-xl">
            Welcome prakritramachandran
          </h1>
          <p className="mt-1 text-xs text-slate-500">Axis Seattle · resident portal</p>
        </div>
        <p className="shrink-0 text-xs font-medium text-slate-500" aria-live="polite">
          <span className="text-[#3b66f5]">●</span> Syncing…
        </p>
      </div>
    </header>
  );
}
