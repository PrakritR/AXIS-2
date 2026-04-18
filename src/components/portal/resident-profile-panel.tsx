"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ManagerSectionShell } from "./manager-section-shell";

export function ResidentProfilePanel() {
  const { showToast } = useAppUi();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [axisId, setAxisId] = useState("");
  const [emName, setEmName] = useState("");
  const [emPhone, setEmPhone] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        if (cancelled) return;
        setEmail(user.email ?? "");
        setName(profile?.full_name ?? "");
        setAxisId(profile?.id ? `AXIS-R-${profile.id.slice(0, 8).toUpperCase()}` : "");
      } catch {
        /* env missing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ManagerSectionShell
      title="Profile"
      actions={[
        {
          label: "Save",
          variant: "primary",
          onClick: () => showToast("Profile saved."),
        },
      ]}
    >
      <div className="grid gap-6 sm:grid-cols-2">
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
    </ManagerSectionShell>
  );
}
