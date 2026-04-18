"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  DEMO_RESIDENT_AXIS_ID,
  DEMO_RESIDENT_DISPLAY_NAME,
  DEMO_RESIDENT_EMAIL,
  DEMO_RESIDENT_EMERGENCY_NAME,
  DEMO_RESIDENT_EMERGENCY_PHONE,
  DEMO_RESIDENT_PHONE,
} from "@/data/demo-portal";
import { ManagerSectionShell } from "./manager-section-shell";

export function ResidentProfilePanel() {
  const { showToast } = useAppUi();
  const [name, setName] = useState(DEMO_RESIDENT_DISPLAY_NAME);
  const [phone, setPhone] = useState(DEMO_RESIDENT_PHONE);
  const [emName, setEmName] = useState(DEMO_RESIDENT_EMERGENCY_NAME);
  const [emPhone, setEmPhone] = useState(DEMO_RESIDENT_EMERGENCY_PHONE);

  return (
    <ManagerSectionShell
      title="Profile"
      actions={[
        {
          label: "Save",
          variant: "primary",
          onClick: () => showToast("Profile saved (demo)."),
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
          <Input value={DEMO_RESIDENT_EMAIL} readOnly className="bg-slate-50/80" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">Axis ID</label>
          <Input value={DEMO_RESIDENT_AXIS_ID} readOnly className="bg-slate-50/80 font-mono text-sm" />
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
