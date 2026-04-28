"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { PORTAL_PAGE_TITLE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";

export function AdminCreateResidentClient() {
  const { showToast } = useAppUi();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !fullName.trim() || !password) {
      showToast("Email, full name, and password are required.");
      return;
    }
    if (password.length < 8) {
      showToast("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/create-resident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim(), password }),
      });
      const body = (await res.json()) as { error?: string; axisId?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not create resident.");
        return;
      }
      showToast(body.axisId ? `Resident account created. Axis ID: ${body.axisId}.` : "Resident account created.");
      setEmail("");
      setFullName("");
      setPassword("");
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={PORTAL_PAGE_TITLE}>Create resident account</h1>
      </div>
      <p className="mt-2 max-w-xl text-sm text-slate-600">
        Provisions a resident portal login. Application approval stays off until your workflow marks them approved—this
        path is separate from manager provisioning.
      </p>

      <div className="mt-8 max-w-md space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-600" htmlFor="cr-email">
            Email
          </label>
          <Input id="cr-email" className="mt-1.5 rounded-xl" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600" htmlFor="cr-name">
            Full name
          </label>
          <Input id="cr-name" className="mt-1.5 rounded-xl" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600" htmlFor="cr-pw">
            Temporary password
          </label>
          <PasswordInput id="cr-pw" className="mt-1.5 rounded-xl" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <Button type="button" className="rounded-full px-8" disabled={busy} onClick={() => void submit()}>
          {busy ? "Creating…" : "Create resident"}
        </Button>
      </div>
    </div>
  );
}
