"use client";

import Link from "next/link";
import { AxisLogoMark } from "@/components/brand/axis-logo";
import { RESIDENT_PORTAL_BASE_PATH } from "@/lib/portals/resident-sections";

export function ResidentDashboardMark({ className = "" }: { className?: string }) {
  return (
    <Link
      href={`${RESIDENT_PORTAL_BASE_PATH}/dashboard`}
      data-attr="resident-dashboard-mark"
      aria-label="Dashboard"
      className={`inline-flex shrink-0 rounded-xl outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/30 active:opacity-80 ${className}`}
    >
      <AxisLogoMark size="compact" />
    </Link>
  );
}
