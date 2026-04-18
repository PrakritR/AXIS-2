import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[20px] border border-black/[0.06] bg-white/80 shadow-[0_2px_16px_rgba(0,0,0,0.06)] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">{title}</h2>
        {subtitle && <p className="mt-1 text-[14px] text-[#6e6e73]">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
