import type { ReactNode } from "react";

/** Portal auth card — white surface, soft shadow, reference radii. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-[28px] border border-slate-200/85 bg-white/98 px-5 py-8 shadow-[var(--shadow-card)] backdrop-blur-[2px] ring-1 ring-white/70 sm:px-10 sm:py-10"
    >
      {children}
    </div>
  );
}
