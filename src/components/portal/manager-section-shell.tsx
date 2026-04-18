import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ManagerSectionShell({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  actions?: { label: string; variant?: "primary" | "secondary" | "outline" }[];
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-sky-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.20),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] px-6 py-6 shadow-[0_24px_70px_-38px_rgba(30,64,175,0.35)] sm:px-8">
        {eyebrow ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700/75">{eyebrow}</p>
        ) : null}
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-[15px]">{subtitle}</p>
          </div>
          {actions?.length ? (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {actions.map((action) => (
                <Button key={action.label} type="button" variant={action.variant ?? "outline"}>
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
