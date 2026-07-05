"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalBugFeedbackPanel } from "@/components/portal/portal-bug-feedback-panel";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { VENDOR_TRADE_OPTIONS } from "@/lib/work-order-taxonomy";
import type { VendorTaxDraft } from "@/components/portal/vendor-tax-profile-modal";

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
