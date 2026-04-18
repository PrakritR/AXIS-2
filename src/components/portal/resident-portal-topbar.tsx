"use client";

export function ResidentPortalTopbar({ displayName }: { displayName: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3 lg:px-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resident portal</p>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-0.5 truncate text-sm text-slate-600">{displayName}</p>
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
