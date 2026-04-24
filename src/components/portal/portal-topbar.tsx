"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AxisLogoMark } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { PortalDefinition } from "@/lib/portal-types";

function formatPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[1] ?? "dashboard";
  return section
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function PortalTopbar({ definition }: { definition: PortalDefinition }) {
  const pathname = usePathname();
  const { showToast } = useAppUi();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-[#f5f5f7]/88 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Signed in</p>
          <p className="truncate text-sm font-medium text-slate-950">{definition.title} · {formatPath(pathname)}</p>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <Button type="button" variant="outline" className="hidden sm:inline-flex" onClick={() => showToast("No new alerts.")}>
            Alerts
          </Button>
          <Link href="/auth/sign-in">
            <Button type="button" variant="ghost" className="px-3 sm:px-5">
              Switch role
            </Button>
          </Link>
          <div className="hidden shrink-0 sm:block" aria-hidden>
            <AxisLogoMark className="scale-90" />
          </div>
        </div>
      </div>
    </header>
  );
}
