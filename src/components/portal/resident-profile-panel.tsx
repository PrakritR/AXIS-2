"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  normalizeApplicationAxisId,
  readManagerApplicationRows,
  resolveResidentPortalAxisId,
} from "@/lib/manager-applications-storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { Button } from "@/components/ui/button";
import { usePortalSession } from "@/hooks/use-portal-session";

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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    if (!session.userId) return;
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

        const meta = authUser?.user?.user_metadata as Record<string, unknown> | undefined;
        const metaAxis = typeof meta?.axis_id === "string" ? meta.axis_id : null;

        setUserId(session.userId);
        setEmail(session.email ?? "");
        setName((current) => current || resolvedName);
        setPhone((current) => current || resolvedPhone);
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
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name.trim(), phone: phone.trim() })
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

  const changePassword = async () => {
    if (newPassword.length < 8) {
      showToast("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        showToast(error.message || "Could not update password.");
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password updated.");
    } catch {
      showToast("Could not update password.");
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <ManagerPortalPageShell
      title="Profile"
      titleAside={
        <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => void saveProfile()}>
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Full name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Email</label>
            <Input value={email} readOnly className="bg-slate-50/80" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-800">Axis ID</label>
            <Input value={axisId} readOnly className="bg-slate-50/80 font-mono text-sm" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-semibold text-slate-800">Emergency contact</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={emName} onChange={(e) => setEmName(e.target.value)} placeholder="Name" />
              <Input value={emPhone} onChange={(e) => setEmPhone(e.target.value)} placeholder="Phone" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Change password</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Update the password used for this resident account.
            </p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">New password</label>
              <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">Confirm new password</label>
              <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={passwordBusy}
              onClick={() => void changePassword()}
            >
              {passwordBusy ? "Updating..." : "Update password"}
            </Button>
          </div>
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
