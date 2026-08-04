"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CreditCard,
  Lock,
  MessageSquareText,
  Settings2,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagerPortalPageShell, PORTAL_PAGE_TITLE } from "@/components/portal/portal-metrics";
import { PortalChangePasswordPanel } from "@/components/portal/portal-change-password-panel";
import { PortalBugFeedbackPanel } from "@/components/portal/portal-bug-feedback-panel";
import { PortalDetailHeader } from "@/components/portal/portal-list-detail-shell";
import { PortalSettingsExtras } from "@/components/portal/portal-settings-extras";
import {
  PortalSettingsField,
  PortalSettingsFormBody,
  PortalSettingsGroup,
  PortalSettingsLinkRow,
  PortalSettingsNav,
  PortalSettingsProfileHeader,
  PortalSettingsRow,
  PortalSettingsSection,
  PortalSettingsSections,
} from "@/components/portal/portal-settings-ui";
import { ManagerPlan } from "@/components/portal/manager-plan";
import { AssistantDisplaySetting } from "@/components/portal/assistant-display-setting";
import { NotificationsToggle } from "@/components/native/notifications-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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

/**
 * Settings categories for the manager layout. The `?tab=` query value is the
 * category id, so `/portal/profile?tab=billing` deep-links to a pane. Category
 * switches use `history.pushState` (which Next syncs into `useSearchParams`)
 * so the browser/gesture back returns from a category to the settings root on
 * phones without a server round trip.
 */
const SETTINGS_TAB_PARAM = "tab";

type SettingsGroupId = "profile" | "billing" | "preferences" | "security" | "feedback" | "account";

type SettingsGroup = {
  id: SettingsGroupId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
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

  const groups = useMemo<SettingsGroup[]>(() => {
    const list: SettingsGroup[] = [
      {
        id: "profile",
        label: "Profile",
        description: `Name, contact details, and ${idLabel}.`,
        icon: UserRound,
      },
    ];
    if (!demo) {
      list.push({
        id: "billing",
        label: "Billing & plan",
        description: "Subscription and payment details.",
        icon: CreditCard,
      });
    }
    list.push(
      {
        id: "preferences",
        label: "Preferences",
        description: "Appearance, assistant, and device options.",
        icon: SlidersHorizontal,
      },
      {
        id: "security",
        label: "Login & security",
        description: "Password and sign-in options.",
        icon: Lock,
      },
      {
        id: "feedback",
        label: "Feedback",
        description: "Report issues or share product feedback.",
        icon: MessageSquareText,
      },
      {
        id: "account",
        label: "Account",
        description: "Switch portals, sign out, or delete your account.",
        icon: Settings2,
      },
    );
    return list;
  }, [demo, idLabel]);

  const rawTab = searchParams.get(SETTINGS_TAB_PARAM);
  const activeGroup = groups.find((g) => g.id === rawTab) ?? null;
  // Desktop always shows a pane; with no tab selected it defaults to Profile.
  const paneGroup = activeGroup ?? groups[0];

  const openGroup = useCallback(
    (id: string) => {
      window.history.pushState(null, "", `${pathname}?${SETTINGS_TAB_PARAM}=${id}`);
    },
    [pathname],
  );
  const backToRoot = useCallback(() => {
    window.history.pushState(null, "", pathname);
  }, [pathname]);

  // Reset scroll when the pane changes — the shell scrolls in an inner
  // container, so a router-style scroll-to-top never happens on its own.
  const layoutTopRef = useRef<HTMLDivElement>(null);
  const skipInitialScroll = useRef(true);
  useEffect(() => {
    if (skipInitialScroll.current) {
      skipInitialScroll.current = false;
      return;
    }
    layoutTopRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [activeGroup?.id]);

  const renderPane = (id: SettingsGroupId): ReactNode => {
    switch (id) {
      case "profile":
        return <PortalSettingsSections>{personalInfoSection}</PortalSettingsSections>;
      case "billing":
        // Slot for the plan/billing feature — ManagerPlan owns everything
        // inside this card; Settings only provides the section frame.
        return (
          <PortalSettingsSections>
            <PortalSettingsSection title="Billing & plan" description="Subscription and payment details.">
              <PortalSettingsGroup>
                <div className="p-4">
                  <ManagerPlan embedded showCurrentPlan={false} />
                </div>
              </PortalSettingsGroup>
            </PortalSettingsSection>
          </PortalSettingsSections>
        );
      case "preferences":
        return (
          <PortalSettingsSections>
            <PortalSettingsSection title="Appearance" description="How PropLane looks on this device.">
              <PortalSettingsGroup>
                <PortalSettingsRow label="Theme" description="Choose light or dark mode.">
                  <ThemeToggle className="shrink-0" />
                </PortalSettingsRow>
              </PortalSettingsGroup>
            </PortalSettingsSection>
            <AssistantDisplaySetting />
            <NotificationsToggle />
          </PortalSettingsSections>
        );
      case "security":
        return (
          <PortalSettingsSections>
            <PortalChangePasswordPanel accountEmail={dashToEmpty(initialEmail) || initialEmail} />
          </PortalSettingsSections>
        );
      case "feedback":
        return (
          <PortalSettingsSections>
            <PortalBugFeedbackPanel reporterRole={portalKind === "pro" ? "pro" : "manager"} embedded />
          </PortalSettingsSections>
        );
      case "account":
        return (
          <PortalSettingsSections>
            <PortalSettingsExtras currentKind={portalKind} variant="session" />
          </PortalSettingsSections>
        );
    }
  };

  if (variant === "manager") {
    return (
      <ManagerPortalPageShell
        title="Settings"
        subtitle="Manage your account settings and preferences."
        // The mobile/native app bar already reads "Settings" — same as every
        // other manager section, drop the duplicate in-page title on phones.
        hideTitleOnMobileNav
      >
        <div ref={layoutTopRef} className="lg:flex lg:items-start lg:gap-10">
          <PortalSettingsNav
            className="sticky top-0 max-lg:hidden"
            name={emptyToDash(fullName)}
            email={initialEmail}
            items={groups.map((g) => ({
              id: g.id,
              label: g.label,
              icon: <g.icon className="h-4 w-4" />,
            }))}
            activeId={paneGroup.id}
            onSelect={openGroup}
          />
          <div className="min-w-0 flex-1 lg:max-w-3xl">
            {activeGroup === null ? (
              <div className="space-y-5 lg:hidden">
                <PortalSettingsProfileHeader name={emptyToDash(fullName)} email={initialEmail} />
                <PortalSettingsGroup>
                  {groups.map((g) => (
                    <PortalSettingsLinkRow
                      key={g.id}
                      icon={<g.icon className="h-4 w-4" />}
                      label={g.label}
                      description={g.description}
                      onClick={() => openGroup(g.id)}
                      dataAttr={`settings-open-${g.id}`}
                    />
                  ))}
                </PortalSettingsGroup>
              </div>
            ) : (
              <div className="mb-4 lg:hidden">
                <PortalDetailHeader
                  title={activeGroup.label}
                  onBack={backToRoot}
                  backLabel="Settings"
                  bare
                  dataAttrBack="settings-back-to-root"
                />
              </div>
            )}
            <div className={activeGroup === null ? "max-lg:hidden" : undefined}>
              {renderPane(paneGroup.id)}
            </div>
          </div>
        </div>
      </ManagerPortalPageShell>
    );
  }

  // Admin keeps the legacy single-scroll settings composition unchanged.
  return (
    <div className="relative z-0 w-full min-w-0">
      <div className="mb-8 max-md:hidden">
        <h1 className={PORTAL_PAGE_TITLE}>Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your account settings and preferences.</p>
      </div>
      <PortalSettingsSections>
        <PortalSettingsProfileHeader name={emptyToDash(fullName)} email={initialEmail} />
        {personalInfoSection}
        <NotificationsToggle />
        <PortalChangePasswordPanel accountEmail={dashToEmpty(initialEmail) || initialEmail} />
        <PortalSettingsExtras currentKind={portalKind} />
      </PortalSettingsSections>
    </div>
  );
}
