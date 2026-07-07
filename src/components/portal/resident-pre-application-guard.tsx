"use client";

import { isResidentApplicationPhaseAllowedPath } from "@/lib/resident-portal-route-guard";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Restricts navigation to Application + Settings until lease access is unlocked. */
export function ResidentPreApplicationGuard({
  isPreApplicationResident,
  leaseAccessUnlocked = false,
  children,
}: {
  /** @deprecated Prefer leaseAccessUnlocked — kept for callers passing isPreApplicationResident only */
  isPreApplicationResident?: boolean;
  leaseAccessUnlocked?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const applicationPhase = leaseAccessUnlocked === false;

  useEffect(() => {
    if (!applicationPhase) return;
    if (isResidentApplicationPhaseAllowedPath(pathname)) return;
    router.replace("/resident/applications/apply");
  }, [applicationPhase, pathname, router]);

  return children;
}
