"use client";

import { isDemoModeActive } from "@/lib/demo/demo-session";
import { useResidentHasCompletedApplicationSubmission } from "@/hooks/use-resident-submitted-applications";
import { isResidentApplicationPhaseAllowedPath } from "@/lib/resident-portal-route-guard";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Restricts navigation to Application + Settings until lease access is unlocked. */
export function ResidentPreApplicationGuard({
  isPreApplicationResident,
  leaseAccessUnlocked = false,
  hasCompletedApplicationSubmission = false,
  children,
}: {
  /** @deprecated Prefer leaseAccessUnlocked — kept for callers passing isPreApplicationResident only */
  isPreApplicationResident?: boolean;
  leaseAccessUnlocked?: boolean;
  hasCompletedApplicationSubmission?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const clientHasCompletedSubmission = useResidentHasCompletedApplicationSubmission();
  const applicationPhase = leaseAccessUnlocked === false;
  const allowDashboard =
    hasCompletedApplicationSubmission || clientHasCompletedSubmission;

  useEffect(() => {
    if (isDemoModeActive()) return;
    if (!applicationPhase) return;
    if (isResidentApplicationPhaseAllowedPath(pathname, { allowDashboard })) return;
    router.replace("/resident/applications/apply");
  }, [allowDashboard, applicationPhase, pathname, router]);

  return children;
}
