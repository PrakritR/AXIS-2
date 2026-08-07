"use client";

import { useEffect, useState } from "react";
import { usePortalSession } from "@/hooks/use-portal-session";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import {
  approvedApplicationAxisIdForResidentEmail,
  readManagerApplicationRows,
  resolveResidentPortalAxisId,
} from "@/lib/manager-applications-storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Resident axis + manager linkage used to scope lease/application reads. */
export function useResidentPortalAxisContext() {
  const session = usePortalSession();
  const [residentAxisId, setResidentAxisId] = useState("");
  const [profileManagerId, setProfileManagerId] = useState<string | null>(null);
  const [axisResolved, setAxisResolved] = useState(false);
  const email = session.email?.trim() || null;

  useEffect(() => {
    if (!session.userId) {
      queueMicrotask(() => setAxisResolved(true));
      return;
    }
    let cancelled = false;
    const normalizedEmail = (session.email ?? "").trim().toLowerCase();
    const approvedApplicationRowId = approvedApplicationAxisIdForResidentEmail(normalizedEmail);
    const matchingApplication = readManagerApplicationRows()
      .slice()
      .reverse()
      .find((row) => row.email?.trim().toLowerCase() === normalizedEmail);

    if (isDemoModeActive()) {
      queueMicrotask(() => {
        if (cancelled) return;
        setProfileManagerId(null);
        setResidentAxisId(
          resolveResidentPortalAxisId({
            applicationRowId: matchingApplication?.id,
            approvedApplicationRowId,
          }),
        );
        setAxisResolved(true);
      });
      return;
    }

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const [{ data: profile }, { data: authUser }] = await Promise.all([
          supabase.from("profiles").select("manager_id").eq("id", session.userId).maybeSingle(),
          supabase.auth.getUser(),
        ]);
        if (cancelled) return;
        const meta = authUser?.user?.user_metadata as Record<string, unknown> | undefined;
        const metaAxis = typeof meta?.axis_id === "string" ? meta.axis_id : null;
        setProfileManagerId(profile?.manager_id ?? null);
        setResidentAxisId(
          resolveResidentPortalAxisId({
            profileManagerId: profile?.manager_id,
            authUserAxisId: metaAxis,
            applicationRowId: matchingApplication?.id,
            approvedApplicationRowId,
          }),
        );
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setAxisResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.userId, session.email]);

  return { email, residentAxisId, profileManagerId, axisResolved };
}
