"use client";

import { isDemoModeActive } from "@/lib/demo/demo-session";
import { useResidentHasCompletedApplicationSubmission } from "@/hooks/use-resident-submitted-applications";
import {
  isResidentApplicationPhaseAllowedPath,
  isResidentPreLeaseAllowedPath,
} from "@/lib/resident-portal-route-guard";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Restricts navigation based on resident portal access state. */
export function ResidentPreApplicationGuard({
  isPreApplicationResident,
  leaseAccessUnlocked = false,
  isPreLeaseResident = false,
  hasCompletedApplicationSubmission = false,
  children,
}: {
  /** @deprecated Prefer leaseAccessUnlocked — kept for callers passing isPreApplicationResident only */
  isPreApplicationResident?: boolean;
  leaseAccessUnlocked?: boolean;
  isPreLeaseResident?: boolean;
  hasCompletedApplicationSubmission?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const clientHasCompletedSubmission = useResidentHasCompletedApplicationSubmission();
  const applicationPhase = leaseAccessUnlocked === false && !isPreLeaseResident;
  const allowDashboard =
    hasCompletedApplicationSubmission || clientHasCompletedSubmission;

  useEffect(() => {
    if (isDemoModeActive()) return;
    if (leaseAccessUnlocked) return;
    if (isPreLeaseResident) {
      if (isResidentPreLeaseAllowedPath(pathname)) return;
      router.replace("/resident/dashboard");
      return;
    }
    if (!applicationPhase) return;
    if (isResidentApplicationPhaseAllowedPath(pathname, { allowDashboard })) return;
    router.replace("/resident/applications/apply");
  }, [allowDashboard, applicationPhase, isPreLeaseResident, leaseAccessUnlocked, pathname, router]);

  return children;
}
