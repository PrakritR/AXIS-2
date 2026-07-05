"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalBugFeedbackPanel } from "@/components/portal/portal-bug-feedback-panel";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { VENDOR_TRADE_OPTIONS } from "@/lib/work-order-taxonomy";
import type { VendorTaxDraft } from "@/components/portal/vendor-tax-profile-modal";
import {
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_LABELS,
  deleteVendorAvailabilityRule,
  fetchVendorAvailability,
  formatMinuteOfDayLabel,
  saveVendorBlockRule,
  saveVendorWeeklyRule,
  timeInputValueToMinuteOfDay,
  type VendorAvailabilityRule,
} from "@/lib/vendor-availability";

type VendorProfileDraft = {
  name: string;
  phone: string;
  email: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  insuranceExpiresAt: string;
};

const EMPTY_PROFILE: VendorProfileDraft = {
  name: "",
  phone: "",
  email: "",
  insuranceProvider: "",
  insurancePolicyNumber: "",
  insuranceExpiresAt: "",
};

const EMPTY_TAX: VendorTaxDraft = {
  legalName: "",
  businessName: "",
  entityType: "business",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zip: "",
  tinType: "ein",
  tin: "",
  w9Attestation: false,
};

type VendorProfileApiRow = {
  name?: string;
  phone?: string;
  email?: string;
  trades?: string[];
  trade?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiresAt?: string;
};

function todayDateInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Weekly recurring hours + one-off blocked dates, editable inline. */
function VendorAvailabilityEditor() {
  const { showToast } = useAppUi();
  const [rules, setRules] = useState<VendorAvailabilityRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [weeklyFormOpen, setWeeklyFormOpen] = useState(false);
  const [weeklyDraft, setWeeklyDraft] = useState({ weekday: 1, start: "09:00", end: "17:00" });
  const [blockFormOpen, setBlockFormOpen] = useState(false);
  const [blockDraft, setBlockDraft] = useState({ date: todayDateInputValue(), allDay: true, start: "09:00", end: "17:00", note: "" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const next = await fetchVendorAvailability();
    setRules(next);
    setLoaded(true);
  };

  useEffect(() => {
    void reload();
  }, []);

  const weeklyByDay = useMemo(() => {
    const map = new Map<number, VendorAvailabilityRule[]>();
    for (const rule of rules) {
      if (rule.kind !== "weekly") continue;
      const list = map.get(rule.weekday) ?? [];
      list.push(rule);
      map.set(rule.weekday, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.kind === "weekly" && b.kind === "weekly" ? a.startMinute - b.startMinute : 0));
    return map;
  }, [rules]);

  const blocks = useMemo(
    () =>
      rules
        .filter((r): r is Extract<VendorAvailabilityRule, { kind: "block" }> => r.kind === "block")
        .sort((a, b) => a.specificDate.localeCompare(b.specificDate)),
    [rules],
  );

  const addWeeklyWindow = async () => {
    const start = timeInputValueToMinuteOfDay(weeklyDraft.start);
    const end = timeInputValueToMinuteOfDay(weeklyDraft.end);
    if (start === null || end === null || start >= end) {
      showToast("Choose a valid start and end time.");
      return;
    }
    setSaving(true);
    const result = await saveVendorWeeklyRule({ weekday: weeklyDraft.weekday, startMinute: start, endMinute: end });
    setSaving(false);
    if (!result.ok) {
      showToast(result.error ?? "Could not save that window.");
      return;
    }
    setWeeklyFormOpen(false);
    showToast("Weekly window added.");
    await reload();
  };

  const addBlock = async () => {
    if (!blockDraft.date) {
      showToast("Choose a date to block.");
      return;
    }
    let startMinute: number | undefined;
    let endMinute: number | undefined;
    if (!blockDraft.allDay) {
      const start = timeInputValueToMinuteOfDay(blockDraft.start);
      const end = timeInputValueToMinuteOfDay(blockDraft.end);
      if (start === null || end === null || start >= end) {
        showToast("Choose a valid start and end time, or mark it all day.");
        return;
      }
      startMinute = start;
      endMinute = end;
    }
    setSaving(true);
    const result = await saveVendorBlockRule({
      specificDate: blockDraft.date,
      startMinute,
      endMinute,
      note: blockDraft.note,
    });
    setSaving(false);
    if (!result.ok) {
      showToast(result.error ?? "Could not block that date.");
      return;
    }
    setBlockFormOpen(false);
    setBlockDraft({ date: todayDateInputValue(), allDay: true, start: "09:00", end: "17:00", note: "" });
    showToast("Date blocked.");
    await reload();
  };

  const removeRule = async (id: string) => {
    setBusyId(id);
    const ok = await deleteVendorAvailabilityRule(id);
    setBusyId(null);
    if (!ok.ok) {
      showToast(ok.error ?? "Could not remove that.");
      return;
    }
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Weekly hours</p>
          <Button
            type="button"
            variant="outline"
            data-attr="vendor-availability-add-weekly"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setWeeklyFormOpen((v) => !v)}
          >
            {weeklyFormOpen ? "Cancel" : "+ Add window"}
          </Button>
        </div>

        {weeklyFormOpen ? (
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-border bg-accent/20 p-3">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              Day
              <Select
                className="h-9 min-w-[110px] rounded-md text-sm"
                value={weeklyDraft.weekday}
                onChange={(e) => setWeeklyDraft((d) => ({ ...d, weekday: Number(e.target.value) }))}
              >
                {WEEKDAY_DISPLAY_ORDER.map((wd) => (
                  <option key={wd} value={wd}>
                    {WEEKDAY_LABELS[wd]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              Start
              <Input
                type="time"
                value={weeklyDraft.start}
                onChange={(e) => setWeeklyDraft((d) => ({ ...d, start: e.target.value }))}
                className="h-9 w-[120px] rounded-md text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              End
              <Input
                type="time"
                value={weeklyDraft.end}
                onChange={(e) => setWeeklyDraft((d) => ({ ...d, end: e.target.value }))}
                className="h-9 w-[120px] rounded-md text-sm"
              />
            </label>
            <Button
              type="button"
              variant="primary"
              data-attr="vendor-availability-save-weekly"
              className="h-9 rounded-full px-4 text-sm"
              disabled={saving}
              onClick={() => void addWeeklyWindow()}
            >
              Save
            </Button>
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          {WEEKDAY_DISPLAY_ORDER.map((wd) => {
            const windows = weeklyByDay.get(wd) ?? [];
            return (
              <div key={wd} className="flex flex-wrap items-center gap-2">
                <span className="w-9 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{WEEKDAY_LABELS[wd]}</span>
                {windows.length === 0 ? (
                  <span className="text-xs text-muted">Unavailable</span>
                ) : (
                  windows.map((w) =>
                    w.kind === "weekly" ? (
                      <span
                        key={w.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-accent/30 px-3 py-1 text-xs font-medium text-foreground ring-1 ring-border"
                      >
                        {formatMinuteOfDayLabel(w.startMinute)}–{formatMinuteOfDayLabel(w.endMinute)}
                        <button
                          type="button"
                          data-attr="vendor-availability-remove-weekly"
                          aria-label={`Remove ${WEEKDAY_LABELS[wd]} ${formatMinuteOfDayLabel(w.startMinute)}–${formatMinuteOfDayLabel(w.endMinute)}`}
                          className="text-muted hover:text-danger"
                          disabled={busyId === w.id}
                          onClick={() => void removeRule(w.id)}
                        >
                          ✕
                        </button>
                      </span>
                    ) : null,
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Blocked dates</p>
          <Button
            type="button"
            variant="outline"
            data-attr="vendor-availability-add-block"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setBlockFormOpen((v) => !v)}
          >
            {blockFormOpen ? "Cancel" : "+ Block a date"}
          </Button>
        </div>

        {blockFormOpen ? (
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-border bg-accent/20 p-3">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              Date
              <Input
                type="date"
                value={blockDraft.date}
                onChange={(e) => setBlockDraft((d) => ({ ...d, date: e.target.value }))}
                className="h-9 w-[160px] rounded-md text-sm"
              />
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-muted">
              <input
                type="checkbox"
                checked={blockDraft.allDay}
                onChange={(e) => setBlockDraft((d) => ({ ...d, allDay: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              All day
            </label>
            {!blockDraft.allDay ? (
              <>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                  Start
                  <Input
                    type="time"
                    value={blockDraft.start}
                    onChange={(e) => setBlockDraft((d) => ({ ...d, start: e.target.value }))}
                    className="h-9 w-[120px] rounded-md text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                  End
                  <Input
                    type="time"
                    value={blockDraft.end}
                    onChange={(e) => setBlockDraft((d) => ({ ...d, end: e.target.value }))}
                    className="h-9 w-[120px] rounded-md text-sm"
                  />
                </label>
              </>
            ) : null}
            <label className="flex flex-1 min-w-[140px] flex-col gap-1 text-[11px] font-medium text-muted">
              Note (optional)
              <Input
                type="text"
                placeholder="e.g. Vacation"
                value={blockDraft.note}
                onChange={(e) => setBlockDraft((d) => ({ ...d, note: e.target.value }))}
                className="h-9 rounded-md text-sm"
              />
            </label>
            <Button
              type="button"
              variant="primary"
              data-attr="vendor-availability-save-block"
              className="h-9 rounded-full px-4 text-sm"
              disabled={saving}
              onClick={() => void addBlock()}
            >
              Save
            </Button>
          </div>
        ) : null}

        <div className="mt-3 space-y-1.5">
          {blocks.length === 0 ? (
            <p className="text-xs text-muted">No blocked dates.</p>
          ) : (
            blocks.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
              >
                <span>
                  <span className="font-medium text-foreground">
                    {new Date(`${b.specificDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>{" "}
                  ·{" "}
                  {b.startMinute === 0 && b.endMinute === 1440
                    ? "All day"
                    : `${formatMinuteOfDayLabel(b.startMinute)}–${formatMinuteOfDayLabel(b.endMinute)}`}
                  {b.note ? <span className="text-muted"> · {b.note}</span> : null}
                </span>
                <button
                  type="button"
                  data-attr="vendor-availability-remove-block"
                  aria-label={`Remove blocked date ${b.specificDate}`}
                  className="text-muted hover:text-danger"
                  disabled={busyId === b.id}
                  onClick={() => void removeRule(b.id)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      {!loaded ? <p className="text-xs text-muted">Loading availability…</p> : null}
    </div>
  );
}

/** Vendor's own Settings — business profile, work capabilities (feeds auto-match), W-9/tax, and feedback. */
export function VendorSettingsPanel() {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();

  const [profileDraft, setProfileDraft] = useState<VendorProfileDraft>(EMPTY_PROFILE);
  const [trades, setTrades] = useState<string[]>([]);
  const [profileLoading, setProfileLoading] = useState(() => !demo);
  const [profileSaving, setProfileSaving] = useState(false);
  const [capabilitiesSaving, setCapabilitiesSaving] = useState(false);

  const [taxDraft, setTaxDraft] = useState<VendorTaxDraft>(EMPTY_TAX);
  const [taxLoading, setTaxLoading] = useState(() => !demo);
  const [taxSaving, setTaxSaving] = useState(false);

  useEffect(() => {
    if (demo) return;
    void fetch("/api/vendor/profile", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { profile?: VendorProfileApiRow | null }) => {
        const p = data.profile;
        if (!p) return;
        setProfileDraft({
          name: p.name ?? "",
          phone: p.phone ?? "",
          email: p.email ?? "",
          insuranceProvider: p.insuranceProvider ?? "",
          insurancePolicyNumber: p.insurancePolicyNumber ?? "",
          insuranceExpiresAt: p.insuranceExpiresAt ?? "",
        });
        setTrades(p.trades && p.trades.length > 0 ? p.trades : p.trade ? [p.trade] : []);
      })
      .finally(() => setProfileLoading(false));
  }, [demo]);

  useEffect(() => {
    if (demo) return;
    void fetch("/api/vendor/tax-profile", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { profile?: Record<string, unknown> | null }) => {
        const p = data.profile;
        if (!p) return;
        setTaxDraft({
          legalName: (p.legal_name as string) ?? "",
          businessName: (p.business_name as string) ?? "",
          entityType: p.entity_type === "individual" ? "individual" : "business",
          addressLine1: (p.address_line1 as string) ?? "",
          addressLine2: (p.address_line2 as string) ?? "",
          city: (p.city as string) ?? "",
          state: (p.state as string) ?? "",
          zip: (p.zip as string) ?? "",
          tinType: p.tin_type === "ssn" ? "ssn" : "ein",
          tin: "",
          w9Attestation: p.w9_attestation === true,
        });
      })
      .finally(() => setTaxLoading(false));
  }, [demo]);

  async function saveProfile() {
    setProfileSaving(true);
    try {
      if (demo) {
        showToast("Profile saved.");
        return;
      }
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: profileDraft.name,
          phone: profileDraft.phone,
          email: profileDraft.email,
          insuranceProvider: profileDraft.insuranceProvider,
          insurancePolicyNumber: profileDraft.insurancePolicyNumber,
          insuranceExpiresAt: profileDraft.insuranceExpiresAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      showToast("Profile saved.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setProfileSaving(false);
    }
  }

  function toggleTrade(trade: string, on: boolean) {
    setTrades((cur) => {
      const set = new Set(cur);
      if (on) set.add(trade);
      else set.delete(trade);
      return [...set];
    });
  }

  async function saveCapabilities() {
    setCapabilitiesSaving(true);
    try {
      if (demo) {
        showToast("Capabilities saved.");
        return;
      }
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ trades }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      showToast("Capabilities saved.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setCapabilitiesSaving(false);
    }
  }

  async function saveTax() {
    setTaxSaving(true);
    try {
      if (demo) {
        showToast("Tax profile saved.");
        return;
      }
      const res = await fetch("/api/vendor/tax-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          legalName: taxDraft.legalName,
          businessName: taxDraft.businessName,
          entityType: taxDraft.entityType,
          addressLine1: taxDraft.addressLine1,
          addressLine2: taxDraft.addressLine2,
          city: taxDraft.city,
          state: taxDraft.state,
          zip: taxDraft.zip,
          tinType: taxDraft.tinType,
          tin: taxDraft.tin || undefined,
          w9Attestation: taxDraft.w9Attestation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      showToast("Tax profile saved.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setTaxSaving(false);
    }
  }

  return (
    <ManagerPortalPageShell title="Settings">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
          <p className="text-sm font-semibold text-foreground">Business profile</p>
          <p className="mt-1 text-xs text-muted">Shown to the manager(s) you work with.</p>

          {profileLoading ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Business name
                <Input
                  value={profileDraft.name}
                  onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })}
                  data-attr="vendor-settings-name"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Phone
                <Input
                  value={profileDraft.phone}
                  onChange={(e) => setProfileDraft({ ...profileDraft, phone: e.target.value })}
                  data-attr="vendor-settings-phone"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Email
                <Input
                  type="email"
                  value={profileDraft.email}
                  onChange={(e) => setProfileDraft({ ...profileDraft, email: e.target.value })}
                  data-attr="vendor-settings-email"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Insurance provider
                <Input
                  value={profileDraft.insuranceProvider}
                  onChange={(e) => setProfileDraft({ ...profileDraft, insuranceProvider: e.target.value })}
                  data-attr="vendor-settings-insurance-provider"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Policy number
                <Input
                  value={profileDraft.insurancePolicyNumber}
                  onChange={(e) => setProfileDraft({ ...profileDraft, insurancePolicyNumber: e.target.value })}
                  data-attr="vendor-settings-insurance-policy"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Coverage expires
                <Input
                  type="date"
                  value={profileDraft.insuranceExpiresAt}
                  onChange={(e) => setProfileDraft({ ...profileDraft, insuranceExpiresAt: e.target.value })}
                  data-attr="vendor-settings-insurance-expires"
                />
              </label>
            </div>
          )}

          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => void saveProfile()}
              disabled={profileSaving || profileLoading}
              data-attr="vendor-settings-profile-save"
            >
              {profileSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
          <p className="text-sm font-semibold text-foreground">Work capabilities</p>
          <p className="mt-1 text-xs text-muted">
            Select every type of work you can do. Managers&apos; auto-match uses this to suggest you for the right
            work orders.
          </p>

          {profileLoading ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : (
            <div className="mt-4 grid gap-2 rounded-xl border border-border bg-accent/30 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {VENDOR_TRADE_OPTIONS.map((option) => {
                const on = trades.includes(option);
                return (
                  <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={on}
                      onChange={(e) => toggleTrade(option, e.target.checked)}
                      data-attr={`vendor-capability-${option.toLowerCase().replace(/\s+/g, "-")}`}
                    />
                    <span className="font-medium text-foreground">{option}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => void saveCapabilities()}
              disabled={capabilitiesSaving || profileLoading}
              data-attr="vendor-settings-capabilities-save"
            >
              {capabilitiesSaving ? "Saving…" : "Save capabilities"}
            </Button>
          </div>
        </section>

        <section className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Availability</p>
          <p className="mb-3 text-xs text-muted">Set your weekly hours and block off dates you&apos;re unavailable for visits.</p>
          <VendorAvailabilityEditor />
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
          <p className="text-sm font-semibold text-foreground">Business & tax info (W-9)</p>
          <p className="mt-1 text-xs text-muted">Shared with the manager(s) who work with you, for 1099 reporting.</p>

          {taxLoading ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Legal name
                <Input value={taxDraft.legalName} onChange={(e) => setTaxDraft({ ...taxDraft, legalName: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Business name (optional)
                <Input
                  value={taxDraft.businessName}
                  onChange={(e) => setTaxDraft({ ...taxDraft, businessName: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Entity type
                <select
                  className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                  value={taxDraft.entityType}
                  onChange={(e) => setTaxDraft({ ...taxDraft, entityType: e.target.value as VendorTaxDraft["entityType"] })}
                >
                  <option value="business">Business</option>
                  <option value="individual">Individual</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                TIN type
                <select
                  className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                  value={taxDraft.tinType}
                  onChange={(e) => setTaxDraft({ ...taxDraft, tinType: e.target.value as VendorTaxDraft["tinType"] })}
                >
                  <option value="ein">EIN</option>
                  <option value="ssn">SSN</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Address line 1
                <Input
                  value={taxDraft.addressLine1}
                  onChange={(e) => setTaxDraft({ ...taxDraft, addressLine1: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Address line 2
                <Input
                  value={taxDraft.addressLine2}
                  onChange={(e) => setTaxDraft({ ...taxDraft, addressLine2: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                City
                <Input value={taxDraft.city} onChange={(e) => setTaxDraft({ ...taxDraft, city: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                State
                <Input value={taxDraft.state} onChange={(e) => setTaxDraft({ ...taxDraft, state: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                ZIP
                <Input value={taxDraft.zip} onChange={(e) => setTaxDraft({ ...taxDraft, zip: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {taxDraft.tinType === "ein" ? "EIN" : "SSN"} (leave blank to keep existing)
                <Input value={taxDraft.tin} onChange={(e) => setTaxDraft({ ...taxDraft, tin: e.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                <input
                  type="checkbox"
                  checked={taxDraft.w9Attestation}
                  onChange={(e) => setTaxDraft({ ...taxDraft, w9Attestation: e.target.checked })}
                />
                W-9 on file
              </label>
            </div>
          )}

          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => void saveTax()}
              disabled={taxSaving || taxLoading}
              data-attr="vendor-tax-profile-save"
            >
              {taxSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
          <p className="text-sm font-semibold text-foreground">Payments</p>
          <p className="mt-1 text-sm text-muted">
            Direct payouts aren&apos;t connected yet — coming soon. Once available, you&apos;ll connect a payout
            account here to get paid directly through Axis.
          </p>
        </section>

        <PortalBugFeedbackPanel reporterRole="vendor" embedded />
      </div>
    </ManagerPortalPageShell>
  );
}
