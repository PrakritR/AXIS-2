import type { ReactNode } from "react";

/** Portal auth card — frosted glass on chrome, 460px max, inset highlight. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="glass-card mx-auto w-full max-w-[460px] rounded-[24px] px-5 py-8 shadow-[0_24px_60px_-20px_rgba(8,11,20,0.55),0_8px_24px_-12px_rgba(15,23,42,0.2),inset_0_1px_0_rgba(255,255,255,0.22)] sm:px-10 sm:py-10"
    >
      {children}
    </div>
  );
}
