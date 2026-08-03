"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagerPortalPageShell, PORTAL_PAGE_TITLE } from "@/components/portal/portal-metrics";
import { PortalChangePasswordPanel } from "@/components/portal/portal-change-password-panel";
import { PortalBugFeedbackPanel } from "@/components/portal/portal-bug-feedback-panel";
import { PortalSettingsExtras } from "@/components/portal/portal-settings-extras";
import {
  PortalSettingsField,
  PortalSettingsFormBody,
  PortalSettingsGroup,
  PortalSettingsProfileHeader,
  PortalSettingsSection,
  PortalSettingsSections,
} from "@/components/portal/portal-settings-ui";
import { ManagerPlan } from "@/components/portal/manager-plan";
import { AssistantDisplaySetting } from "@/components/portal/assistant-display-setting";
import { NotificationsToggle } from "@/components/native/notifications-toggle";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import type { PortalKind } from "@/lib/portal-types";

function dashToEmpty(v: string) {
  return v === "—" ? "" : v;
}

function emptyToDash(v: string) {
  const t = v.trim();
  return t.length ? t : "—";
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
  const demo = isDemoModeActive();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(dashToEmpty(initialFullName));
  const [phone, setPhone] = useState(dashToEmpty(initialPhone));
  const [saving, setSaving] = useState(false);
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
    if (demo) {
      showToast("Profile changes are simulated in this demo.");
      setPendingSkipServerPropsSync(true);
      setEditing(false);
      return;
    }
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
    } catch {
      showToast("Network error.");
    } finally {
      setSaving(false);
    }
  }, [demo, fullName, phone, showToast]);

  const cancel = useCallback(() => {
    setFullName(dashToEmpty(initialFullName));
    setPhone(dashToEmpty(initialPhone));
    setEditing(false);
  }, [initialFullName, initialPhone]);

  const editAction = editing ? (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="primary" className="px-4 text-[13px]" disabled={saving} onClick={() => save()}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  ) : (
    <Button type="button" variant="outline" className="px-4 text-[13px]" onClick={() => setEditing(true)}>
      Edit
    </Button>
  );

  const personalInfoSection = (
    <PortalSettingsSection
      title="Personal information"
      description="Your name and contact details."
      action={editAction}
    >
      <PortalSettingsGroup>
        {editing ? (
          <PortalSettingsFormBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="pf-name">
                  Full name
                </label>
                <Input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="pf-email">
                  Email
                </label>
                <Input id="pf-email" value={initialEmail} readOnly className="bg-muted/40" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="pf-phone">
                  Phone
                </label>
                <Input
                  id="pf-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="pf-id">
                  {idLabel}
                </label>
                <Input id="pf-id" value={idValue} readOnly className="bg-muted/40 font-mono text-sm" />
              </div>
            </div>
          </PortalSettingsFormBody>
        ) : (
          <>
            <PortalSettingsField label="Full name" value={emptyToDash(fullName)} />
            <PortalSettingsField label="Email" value={initialEmail} />
            <PortalSettingsField label="Phone" value={emptyToDash(phone)} />
            <PortalSettingsField label={idLabel} value={idValue} mono />
          </>
        )}
      </PortalSettingsGroup>
    </PortalSettingsSection>
  );

  const settingsBody = (
    <PortalSettingsSections>
      <PortalSettingsProfileHeader name={emptyToDash(fullName)} email={initialEmail} />
      {personalInfoSection}
      {variant === "manager" && !demo ? (
        <PortalSettingsSection title="Billing & plan" description="Subscription and payment details.">
          <PortalSettingsGroup>
            <div className="p-4">
              <ManagerPlan embedded showCurrentPlan={false} />
            </div>
          </PortalSettingsGroup>
        </PortalSettingsSection>
      ) : null}
      {variant === "manager" ? <AssistantDisplaySetting /> : null}
      <NotificationsToggle />
      <PortalChangePasswordPanel accountEmail={dashToEmpty(initialEmail) || initialEmail} />
      {variant === "manager" ? (
        <PortalBugFeedbackPanel reporterRole={portalKind === "pro" ? "pro" : "manager"} embedded />
      ) : null}
      <PortalSettingsExtras currentKind={portalKind} />
    </PortalSettingsSections>
  );

  if (variant === "manager") {
    return (
      <ManagerPortalPageShell
        title="Settings"
        subtitle="Manage your account settings and preferences."
        // The mobile/native app bar already reads "Settings" — same as every
        // other manager section, drop the duplicate in-page title on phones.
        hideTitleOnMobileNav
      >
        {settingsBody}
      </ManagerPortalPageShell>
    );
  }

  return (
    <div className="relative z-0 w-full min-w-0">
      <div className="mb-8 max-md:hidden">
        <h1 className={PORTAL_PAGE_TITLE}>Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your account settings and preferences.</p>
      </div>
      {settingsBody}
    </div>
  );
}
