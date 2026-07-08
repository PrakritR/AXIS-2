"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PortalChangePasswordPanel } from "@/components/portal/portal-change-password-panel";
import { PortalBugFeedbackPanel } from "@/components/portal/portal-bug-feedback-panel";
import {
  normalizeApplicationAxisId,
  readManagerApplicationRows,
  resolveResidentPortalAxisId,
} from "@/lib/manager-applications-storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { PortalSettingsExtras } from "@/components/portal/portal-settings-extras";
import { Button } from "@/components/ui/button";
import { NotificationsToggle } from "@/components/native/notifications-toggle";
import { usePortalSession } from "@/hooks/use-portal-session";
import { isDemoModeActive } from "@/lib/demo/demo-session";

export function ResidentProfilePanel() {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [axisId, setAxisId] = useState("");
  const [emName, setEmName] = useState("");
  const [emPhone, setEmPhone] = useState("");

  useEffect(() => {
    if (!session.userId) return;
    // Demo sandbox: populate from the browser-local demo stores only — the
    // Supabase session belongs to whoever is signed in (if anyone), and the
    // backfill POST below must never run against a real profile.
    if (isDemoModeActive()) {
      const demoUserId = session.userId;
      const demoEmail = session.email ?? "";
      queueMicrotask(() => {
        const normalizedEmail = demoEmail.trim().toLowerCase();
        const matchingApplication = readManagerApplicationRows()
          .slice()
          .reverse()
          .find((row) => row.email?.trim().toLowerCase() === normalizedEmail);
        setUserId(demoUserId);
        setEmail(demoEmail);
        setName((current) => current || matchingApplication?.name?.trim() || "");
        setPhone((current) => current || matchingApplication?.application?.phone?.trim() || "");
        setAxisId(resolveResidentPortalAxisId({ applicationRowId: matchingApplication?.id }));
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const [{ data: profile }, { data: authUser }] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", session.userId).maybeSingle(),
          supabase.auth.getUser(),
        ]);
        if (cancelled) return;

        const normalizedEmail = (session.email ?? "").trim().toLowerCase();
        const matchingApplication = readManagerApplicationRows()
          .slice()
          .reverse()
          .find((row) => row.email?.trim().toLowerCase() === normalizedEmail);

        const resolvedName =
          profile?.full_name?.trim() ||
          matchingApplication?.application?.fullLegalName?.trim() ||
          matchingApplication?.name?.trim() ||
          "";
        const resolvedPhone =
          profile?.phone?.trim() ||
          matchingApplication?.application?.phone?.trim() ||
          "";
        const resolvedEmName =
          (profile?.emergency_contact_name as string | null)?.trim() || "";
        const resolvedEmPhone =
          (profile?.emergency_contact_phone as string | null)?.trim() || "";

        const meta = authUser?.user?.user_metadata as Record<string, unknown> | undefined;
        const metaAxis = typeof meta?.axis_id === "string" ? meta.axis_id : null;

        setUserId(session.userId);
        setEmail(session.email ?? "");
        setName((current) => current || resolvedName);
        setPhone((current) => current || resolvedPhone);
        setEmName((current) => current || resolvedEmName);
        setEmPhone((current) => current || resolvedEmPhone);
        setAxisId(
          resolveResidentPortalAxisId({
            profileManagerId: profile?.manager_id,
            authUserAxisId: metaAxis,
            applicationRowId: matchingApplication?.id,
          }),
        );

        const appCanonical = matchingApplication?.id
          ? normalizeApplicationAxisId(matchingApplication.id)
          : "";
        const storedManagerAxis = normalizeApplicationAxisId(String(profile?.manager_id ?? ""));
        const needsAxisBackfill = Boolean(
          appCanonical && storedManagerAxis !== appCanonical,
        );

        const needsProfileBackfill =
          !profile ||
          !String(profile.full_name ?? "").trim() ||
          !String(profile.phone ?? "").trim();

        if (needsProfileBackfill || needsAxisBackfill) {
          void fetch("/api/profile/backfill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fullName: resolvedName || undefined,
              phone: resolvedPhone || undefined,
              ...(needsAxisBackfill ? { axisId: appCanonical } : {}),
            }),
          }).catch(() => undefined);
        }
      } catch {
        /* env missing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.email, session.userId]);

  const saveProfile = async () => {
    if (!userId) {
      showToast("Sign in to save profile.");
      return;
    }
    if (!name.trim()) {
      showToast("Name is required.");
      return;
    }
    if (isDemoModeActive()) {
      showToast("Profile changes are simulated in this demo.");
      return;
    }
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name.trim(), phone: phone.trim(), emergency_contact_name: emName.trim(), emergency_contact_phone: emPhone.trim() })
        .eq("id", userId);
      if (error) {
        showToast("Could not save profile.");
        return;
      }
      showToast("Profile saved.");
    } catch {
      showToast("Could not save profile.");
    }
  };

  return (
    <ManagerPortalPageShell
      title="Settings"
      titleAside={
        <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => void saveProfile()}>
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <PortalCollapsibleSection
          title="Profile"
          surfaceMuted={false}
          contentClassName="px-4 pb-4"
          toggleDataAttr="resident-profile-toggle"
        >
          <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Full name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Email</label>
            <Input value={email} readOnly className="bg-accent/30" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Axis ID</label>
            <Input value={axisId} readOnly className="bg-accent/30 font-mono text-sm" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-semibold text-foreground">Emergency contact</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={emName} onChange={(e) => setEmName(e.target.value)} placeholder="Name" />
              <Input value={emPhone} onChange={(e) => setEmPhone(e.target.value)} placeholder="Phone" />
            </div>
          </div>
          </div>
        </PortalCollapsibleSection>

        <NotificationsToggle />

        <PortalChangePasswordPanel accountEmail={email} />

        <div className="hidden md:block">
          <PortalBugFeedbackPanel reporterRole="resident" embedded />
        </div>

        <PortalSettingsExtras currentKind="resident" />
      </div>
    </ManagerPortalPageShell>
  );
}
