"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ManagerPortalPageShell, PORTAL_PAGE_TITLE, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { PortalChangePasswordPanel } from "@/components/portal/portal-change-password-panel";
import { PortalSettingsExtras } from "@/components/portal/portal-settings-extras";
import { ManagerPlan } from "@/components/portal/manager-plan";
import { NotificationsToggle } from "@/components/native/notifications-toggle";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useIsNativeApp, useNativeChrome } from "@/hooks/use-is-native-app";
import type { PortalKind } from "@/lib/portal-types";

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
  compact,
}: {
  label: string;
  value: string;
  mono?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-start justify-between gap-4 border-b border-border/80 py-3 last:border-0">
        <p className="shrink-0 text-[13px] font-medium text-muted">{label}</p>
        <p
          className={`min-w-0 text-right text-[15px] font-medium text-foreground ${
            mono ? "break-all font-mono text-xs leading-relaxed" : ""
          }`}
        >
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted">{label}</p>
      <div
        className={`rounded-xl border border-border bg-accent/30 px-4 py-3 text-[15px] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ${
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
  portalKind,
  initialFullName,
  initialEmail,
  initialPhone,
  idLabel,
  idValue,
}: {
  variant: "admin" | "manager";
  portalKind: PortalKind;
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
  const [pendingSkipServerPropsSync, setPendingSkipServerPropsSync] = useState(false);

  useEffect(() => {
    if (!pendingSkipServerPropsSync) return;
    skipNextServerPropsSync.current = true;
    queueMicrotask(() => setPendingSkipServerPropsSync(false));
  }, [pendingSkipServerPropsSync]);

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
      setPendingSkipServerPropsSync(true);
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

  const compactNative = useNativeChrome();

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
      <div
        className={
          compactNative
            ? "divide-y divide-border/80 rounded-2xl border border-border bg-card/50 px-4 py-1"
            : `grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2 ${variant === "admin" ? "mt-8" : ""}`
        }
      >
        {editing ? (
          <>
            <div className={compactNative ? "py-3" : "space-y-2"}>
              <label className="text-sm font-semibold text-foreground" htmlFor="pf-name">
                Full name
              </label>
              <Input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 rounded-xl" autoComplete="name" />
            </div>
            <ProfileReadonlyField label="Email" value={initialEmail} compact={compactNative} />
            <div className={compactNative ? "py-3" : "space-y-2"}>
              <label className="text-sm font-semibold text-foreground" htmlFor="pf-phone">
                Phone
              </label>
              <Input
                id="pf-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-2 rounded-xl"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <ProfileReadonlyField label={idLabel} value={idValue} mono compact={compactNative} />
          </>
        ) : (
          <>
            <ProfileReadonlyField label="Full name" value={emptyToDash(fullName)} compact={compactNative} />
            <ProfileReadonlyField label="Email" value={initialEmail} compact={compactNative} />
            <ProfileReadonlyField label="Phone" value={emptyToDash(phone)} compact={compactNative} />
            <ProfileReadonlyField label={idLabel} value={idValue} mono compact={compactNative} />
          </>
        )}
      </div>
    </>
  );

  if (variant === "manager") {
    return (
      <ManagerPortalPageShell
        title="Settings"
        titleAside={
          <div className="flex flex-wrap gap-2">
            {headerActions.map((a) => (
              <Button
                key={a.label}
                type="button"
                variant={a.variant === "primary" ? "primary" : "outline"}
                className="shrink-0 rounded-full border-border px-5 py-2.5 text-sm font-semibold"
                disabled={(saving && a.label !== "Cancel") || Boolean((a as { disabled?: boolean }).disabled)}
                onClick={a.onClick}
              >
                {a.label}
              </Button>
            ))}
          </div>
        }
      >
        <div className="space-y-3 [html[data-native]_&]:space-y-2.5">
          <Card className="rounded-3xl border border-border p-6 sm:p-8 [html[data-native]_&]:rounded-2xl [html[data-native]_&]:p-4">{inner}</Card>
          <Card className="rounded-3xl border border-border p-6 sm:p-8 [html[data-native]_&]:rounded-2xl [html[data-native]_&]:p-4">
            <h2 className="text-base font-semibold tracking-tight text-foreground">Billing</h2>
            <div className="mt-4">
              <ManagerPlan embedded />
            </div>
          </Card>
          <NotificationsToggle />
          <PortalChangePasswordPanel
            accountEmail={dashToEmpty(initialEmail) || initialEmail}
            accountLabel="your property portal account"
          />
          <PortalSettingsExtras currentKind={portalKind} />
        </div>
      </ManagerPortalPageShell>
    );
  }

  return (
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className={PORTAL_PAGE_TITLE}>Settings</h1>
        <div className="flex flex-wrap gap-2">
          {headerActions.map((a) => (
            <Button
              key={a.label}
              type="button"
              variant={a.variant === "primary" ? "primary" : "outline"}
              className="shrink-0 rounded-full border-border px-5 py-2.5 text-sm font-semibold"
              disabled={saving && a.label !== "Cancel"}
              onClick={a.onClick}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </div>
      {inner}
      <div className="mt-6">
        <NotificationsToggle />
      </div>
      <div className="mt-6">
        <PortalChangePasswordPanel
          accountEmail={dashToEmpty(initialEmail) || initialEmail}
          accountLabel="your admin account"
        />
      </div>
      <div className="mt-6">
        <PortalSettingsExtras currentKind={portalKind} />
      </div>
    </div>
  );
}
