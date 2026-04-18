"use client";

export function ResidentPortalTopbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:py-4 lg:px-8">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Resident portal</p>
          <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Welcome back
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Axis Housing</p>
        </div>
        <div
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200/90 bg-slate-50/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm"
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
