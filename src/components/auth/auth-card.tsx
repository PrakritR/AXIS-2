import type { ReactNode } from "react";

/** Portal auth card — white surface, soft shadow, reference radii. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[26px] border border-[#e0e4ec] bg-white px-8 py-9 shadow-[0_20px_60px_-24px_rgba(15,23,42,0.14)] sm:px-10 sm:py-10">
      {children}
    </div>
  );
}
