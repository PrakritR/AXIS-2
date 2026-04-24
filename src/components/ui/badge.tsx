import type { ReactNode } from "react";

const tones: Record<string, string> = {
  neutral: "bg-slate-100/80 text-slate-700 border-slate-200/80",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
  warning: "bg-amber-50 text-amber-900 border-amber-200/80",
  danger: "bg-red-50 text-red-800 border-red-200/80",
  info: "border-primary/15 bg-primary/[0.06] text-primary",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.01em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
