import type { ReactNode } from "react";

/** Portal auth card — frosted glass with accent edge; compact on phone and native shell. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="auth-card-shell relative mx-auto w-full max-w-[460px]">
      <div
        className="pointer-events-none absolute -inset-px rounded-[21px] bg-[linear-gradient(145deg,rgba(47,107,255,0.35),rgba(143,180,255,0.12),rgba(47,107,255,0.2))] opacity-80 sm:rounded-[25px]"
        aria-hidden
      />
      <div className="auth-card glass-card relative rounded-[20px] px-4 py-5 sm:rounded-[24px] sm:px-8 sm:py-8 md:px-10 md:py-10">
        <div
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]"
          aria-hidden
        />
        {children}
      </div>
    </div>
  );
}
