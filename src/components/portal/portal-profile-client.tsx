"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ManagerPortalPageShell, PORTAL_PAGE_TITLE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";

function dashToEmpty(v: string) {
  return v === "—" ? "" : v;
}

function emptyToDash(v: string) {
  const t = v.trim();
  return t.length ? t : "—";
}

function ProfileReadonlyField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div
        className={`rounded-xl border border-slate-200/90 bg-slate-50/90 px-4 py-3 text-[15px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ${
          mono ? "break-all font-mono text-sm leading-relaxed" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function PortalProfileClient({
  variant,
  initialFullName,
  initialEmail,
  initialPhone,
  idLabel,
  idValue,
}: {
  variant: "admin" | "manager";
  initialFullName: string;
  initialEmail: string;
  initialPhone: string;
  idLabel: string;
  idValue: string;
}) {
  const { showToast } = useAppUi();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(dashToEmpty(initialFullName));
  const [phone, setPhone] = useState(dashToEmpty(initialPhone));
  const [saving, setSaving] = useState(false);
  /** Skip one sync from server props after save so we don't overwrite local state before RSC catches up. */
  const skipNextServerPropsSync = useRef(false);

  useEffect(() => {
    if (editing) return;
    if (skipNextServerPropsSync.current) {
      skipNextServerPropsSync.current = false;
      return;
    }
    setFullName(dashToEmpty(initialFullName));
    setPhone(dashToEmpty(initialPhone));
  }, [initialFullName, initialPhone, editing]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone }),
      });
      const raw = await res.text();
      let body: { error?: string; ok?: boolean } = {};
      try {
        body = raw ? (JSON.parse(raw) as { error?: string; ok?: boolean }) : {};
      } catch {
        showToast("Save failed (invalid response).");
        return;
      }
      if (!res.ok) {
        showToast(body.error ?? "Could not save profile.");
        return;
      }
      showToast("Profile saved.");
      skipNextServerPropsSync.current = true;
      setEditing(false);
      // Full RSC refresh can 500 on some hosts; next navigation will re-sync from server. Local state is already correct.
    } catch {
      showToast("Network error.");
    } finally {
      setSaving(false);
    }
  }, [fullName, phone, showToast]);

  const cancel = useCallback(() => {
    setFullName(dashToEmpty(initialFullName));
    setPhone(dashToEmpty(initialPhone));
    setEditing(false);
  }, [initialFullName, initialPhone]);

  const headerActions = editing
    ? [
        {
          label: "Cancel",
          variant: "outline" as const,
          onClick: cancel,
        },
        {
          label: saving ? "Saving…" : "Save",
          variant: "primary" as const,
          onClick: () => void save(),
          disabled: saving,
        },
      ]
    : [
        {
          label: "Edit info",
          variant: "outline" as const,
          onClick: () => setEditing(true),
        },
      ];

  const inner = (
    <>
      <div className={`grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2 ${variant === "admin" ? "mt-8" : ""}`}>
        {editing ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-800" htmlFor="pf-name">
                Full name
              </label>
              <Input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="rounded-xl" autoComplete="name" />
            </div>
            <ProfileReadonlyField label="Email" value={initialEmail} />
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-800" htmlFor="pf-phone">
                Phone
              </label>
              <Input
                id="pf-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-xl"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <ProfileReadonlyField label={idLabel} value={idValue} mono />
          </>
        ) : (
          <>
            <ProfileReadonlyField label="Full name" value={emptyToDash(fullName)} />
            <ProfileReadonlyField label="Email" value={initialEmail} />
            <ProfileReadonlyField label="Phone" value={emptyToDash(phone)} />
            <ProfileReadonlyField label={idLabel} value={idValue} mono />
          </>
        )}
      </div>
    </>
  );

  if (variant === "manager") {
    return (
      <ManagerPortalPageShell
        title="Profile"
        titleAside={
          <div className="flex flex-wrap gap-2">
            {headerActions.map((a) => (
              <Button
                key={a.label}
                type="button"
                variant={a.variant === "primary" ? "primary" : "outline"}
                className="shrink-0 rounded-full border-slate-200/90 px-5 py-2.5 text-sm font-semibold"
                disabled={(saving && a.label !== "Cancel") || Boolean((a as { disabled?: boolean }).disabled)}
                onClick={a.onClick}
              >
                {a.label}
              </Button>
            ))}
          </div>
        }
      >
        <Card className="rounded-3xl border border-slate-200/80 p-6 sm:p-8">{inner}</Card>
      </ManagerPortalPageShell>
    );
  }

  return (
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={PORTAL_PAGE_TITLE}>Profile</h1>
        <div className="flex flex-wrap gap-2">
          {headerActions.map((a) => (
            <Button
              key={a.label}
              type="button"
              variant={a.variant === "primary" ? "primary" : "outline"}
              className="shrink-0 rounded-full border-slate-200/90 px-5 py-2.5 text-sm font-semibold"
              disabled={saving && a.label !== "Cancel"}
              onClick={a.onClick}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </div>
      {inner}
    </div>
  );
}
