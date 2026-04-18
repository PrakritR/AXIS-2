import type { ReactNode } from "react";

/** Shared rental apply layout: label column left, control column right (sm+). */
export function ApplyFieldRow({
  label,
  hint,
  error,
  children,
  className = "",
  optional = false,
  labelClassName = "text-xs font-semibold text-slate-800",
}: {
  label: ReactNode;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  optional?: boolean;
  /** e.g. larger text for long signer questions */
  labelClassName?: string;
}) {
  return (
    <div
      className={`grid gap-3 border-b border-slate-100 py-4 last:border-b-0 sm:border-b-0 sm:py-4 sm:grid-cols-[minmax(168px,220px)_minmax(0,1fr)] sm:items-start ${className}`}
    >
      <div className="sm:pt-2">
        <div className={labelClassName}>
          {label}
          {!optional ? <span className="font-semibold text-primary"> *</span> : null}
        </div>
        {hint ? <p className="mt-1 text-[11px] leading-snug text-slate-400">{hint}</p> : null}
      </div>
      <div className="min-w-0">
        {children}
        {error ? (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
            <span className="mt-0.5 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold leading-none text-red-700">
              !
            </span>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
