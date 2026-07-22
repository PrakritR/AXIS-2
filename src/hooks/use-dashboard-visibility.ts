"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DASHBOARD_PREFS_EVENT,
  defaultDashboardVisibility,
  readDashboardVisibility,
  resetDashboardVisibility,
  setDashboardSectionVisibility,
  type DashboardSectionId,
  type DashboardVisibility,
} from "@/lib/dashboard-preferences";

/**
 * Reactive per-user dashboard section visibility. Renders catalog defaults on
 * the server / first paint (avoiding hydration mismatch), then reconciles to the
 * user's stored overrides after mount and on any preference change.
 */
export function useDashboardVisibility(userId: string | null | undefined): {
  visibility: DashboardVisibility;
  setVisible: (id: DashboardSectionId, visible: boolean) => void;
  reset: () => void;
} {
  const [visibility, setVisibility] = useState<DashboardVisibility>(defaultDashboardVisibility);

  useEffect(() => {
    const refresh = () => setVisibility(readDashboardVisibility(userId));
    refresh();
    window.addEventListener(DASHBOARD_PREFS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(DASHBOARD_PREFS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userId]);

  const setVisible = useCallback(
    (id: DashboardSectionId, visible: boolean) => setDashboardSectionVisibility(userId, id, visible),
    [userId],
  );
  const reset = useCallback(() => resetDashboardVisibility(userId), [userId]);

  return { visibility, setVisible, reset };
}
