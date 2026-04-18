"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AxisLogoMark } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { PortalDefinition } from "@/lib/portal-types";

export function PortalTopbar({ definition }: { definition: PortalDefinition }) {
  const pathname = usePathname();
  const { showToast } = useAppUi();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted">
            Signed in (demo)
          </p>
          <p className="truncate text-sm font-semibold text-foreground">
            {definition.title} · {pathname}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => showToast("Notifications (demo)")}>
            Alerts
          </Button>
          <Link href="/auth/sign-in">
            <Button type="button" variant="ghost">
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
