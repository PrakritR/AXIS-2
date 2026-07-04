"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import type { VendorTaxDraft } from "@/components/portal/vendor-tax-profile-modal";

const EMPTY: VendorTaxDraft = {
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

/** Vendor's own Profile tab — self-service W-9/tax info, plus a Payments placeholder (Stripe Connect payouts land in Phase 3). */
export function VendorProfilePanel() {
  const { showToast } = useAppUi();
  const [draft, setDraft] = useState<VendorTaxDraft>(EMPTY);
  const [loading, setLoading] = useState(() => !isDemoModeActive());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isDemoModeActive()) return;
    void fetch("/api/vendor/tax-profile", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { profile?: Record<string, unknown> | null }) => {
        const p = data.profile;
        if (!p) return;
        setDraft({
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
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      if (isDemoModeActive()) {
        // Nothing to persist server-side in the sandbox — just confirm the
        // (ephemeral) local edit, same as the rest of the demo experience.
        showToast("Tax profile saved.");
        return;
      }
      const res = await fetch("/api/vendor/tax-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          legalName: draft.legalName,
          businessName: draft.businessName,
          entityType: draft.entityType,
          addressLine1: draft.addressLine1,
          addressLine2: draft.addressLine2,
          city: draft.city,
          state: draft.state,
          zip: draft.zip,
          tinType: draft.tinType,
          tin: draft.tin || undefined,
          w9Attestation: draft.w9Attestation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      showToast("Tax profile saved.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ManagerPortalPageShell title="Profile">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
          <p className="text-sm font-semibold text-foreground">Business & tax info (W-9)</p>
          <p className="mt-1 text-xs text-muted">Shared with the manager(s) who work with you, for 1099 reporting.</p>

          {loading ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Legal name
                <Input value={draft.legalName} onChange={(e) => setDraft({ ...draft, legalName: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Business name (optional)
                <Input value={draft.businessName} onChange={(e) => setDraft({ ...draft, businessName: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Entity type
                <select
                  className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                  value={draft.entityType}
                  onChange={(e) => setDraft({ ...draft, entityType: e.target.value as VendorTaxDraft["entityType"] })}
                >
                  <option value="business">Business</option>
                  <option value="individual">Individual</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                TIN type
                <select
                  className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                  value={draft.tinType}
                  onChange={(e) => setDraft({ ...draft, tinType: e.target.value as VendorTaxDraft["tinType"] })}
                >
                  <option value="ein">EIN</option>
                  <option value="ssn">SSN</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Address line 1
                <Input value={draft.addressLine1} onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Address line 2
                <Input value={draft.addressLine2} onChange={(e) => setDraft({ ...draft, addressLine2: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                City
                <Input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                State
                <Input value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                ZIP
                <Input value={draft.zip} onChange={(e) => setDraft({ ...draft, zip: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {draft.tinType === "ein" ? "EIN" : "SSN"} (leave blank to keep existing)
                <Input value={draft.tin} onChange={(e) => setDraft({ ...draft, tin: e.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.w9Attestation}
                  onChange={(e) => setDraft({ ...draft, w9Attestation: e.target.checked })}
                />
                W-9 on file
              </label>
            </div>
          )}

          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => void save()}
              disabled={saving || loading}
              data-attr="vendor-tax-profile-save"
            >
              {saving ? "Saving…" : "Save"}
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
      </div>
    </ManagerPortalPageShell>
  );
}
