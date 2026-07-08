"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  MANAGER_APPLICATIONS_EVENT,
  readManagerApplicationRows,
  syncManagerApplicationsFromServer,
} from "@/lib/manager-applications-storage";
import { isInProgressApplicationRow } from "@/lib/rental-application/in-progress-application";

function rowsForResident(email: string): DemoApplicantRow[] {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  return readManagerApplicationRows().filter((row) => (row.email ?? "").trim().toLowerCase() === normalized);
}

/** True when the resident has at least one application past the in-progress draft stage. */
export function useResidentHasCompletedApplicationSubmission(): boolean {
  const { email, ready } = usePortalSession();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!ready) return;
    const bump = () => setTick((n) => n + 1);
    void syncManagerApplicationsFromServer().then(bump);
    window.addEventListener(MANAGER_APPLICATIONS_EVENT, bump);
    return () => window.removeEventListener(MANAGER_APPLICATIONS_EVENT, bump);
  }, [ready]);

  return useMemo(() => {
    void tick;
    const residentEmail = (email ?? "").trim().toLowerCase();
    if (!residentEmail) return false;
    return rowsForResident(residentEmail).some((row) => !isInProgressApplicationRow(row));
  }, [email, tick]);
}
