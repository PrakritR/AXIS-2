"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { readManagerApplicationRows } from "@/lib/manager-applications-storage";
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

  useEffect(() => {
    if (!session.userId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.userId).maybeSingle();
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

        setUserId(session.userId);
        setEmail(session.email ?? "");
        setName((current) => current || resolvedName);
        setPhone((current) => current || resolvedPhone);
        setAxisId(profile?.id ? `AXIS-R-${profile.id.slice(0, 8).toUpperCase()}` : "");

        const needsProfileBackfill =
          !profile ||
          !String(profile.full_name ?? "").trim() ||
          !String(profile.phone ?? "").trim();

        if (needsProfileBackfill) {
          void fetch("/api/profile/backfill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fullName: resolvedName || undefined,
              phone: resolvedPhone || undefined,
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

  return (
    <ManagerPortalPageShell
      title="Profile"
      titleAside={
        <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={() => void saveProfile()}>
          Save
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
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
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Resident access</p>
          <p className="mt-3 text-sm font-semibold text-slate-900">{axisId || "Axis ID pending"}</p>
          <p className="mt-1 text-sm text-slate-600">Keep this profile current so your manager can reach you for lease, payment, and work-order updates.</p>
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
