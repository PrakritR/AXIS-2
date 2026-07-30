"use client";

import { useCallback, useEffect, useState } from "react";
import {
  defaultResidentDashboardVisibility,
  readResidentDashboardVisibility,
  resetResidentDashboardVisibility,
  RESIDENT_DASHBOARD_PREFS_EVENT,
  setResidentDashboardSectionVisibility,
  type ResidentDashboardSectionId,
  type ResidentDashboardVisibility,
} from "@/lib/resident-dashboard-preferences";

export function useResidentDashboardVisibility(userId: string | null | undefined): {
  visibility: ResidentDashboardVisibility;
  setVisible: (id: ResidentDashboardSectionId, visible: boolean) => void;
  reset: () => void;
} {
  const [visibility, setVisibility] = useState<ResidentDashboardVisibility>(defaultResidentDashboardVisibility);

  useEffect(() => {
    const refresh = () => setVisibility(readResidentDashboardVisibility(userId));
    refresh();
    window.addEventListener(RESIDENT_DASHBOARD_PREFS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(RESIDENT_DASHBOARD_PREFS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userId]);

  const setVisible = useCallback(
    (id: ResidentDashboardSectionId, visible: boolean) =>
      setResidentDashboardSectionVisibility(userId, id, visible),
    [userId],
  );
  const reset = useCallback(() => resetResidentDashboardVisibility(userId), [userId]);

  return { visibility, setVisible, reset };
}
