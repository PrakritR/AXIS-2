import type { ReactNode } from "react";

/** Centered portal auth card — matches Resident portal reference. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[28px] border border-slate-200/90 bg-white px-8 py-9 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.2)] sm:px-10 sm:py-10">
      {children}
    </div>
  );
}
