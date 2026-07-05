"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalStripeConnectPanel } from "@/components/portal/portal-stripe-connect-panel";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { DEMO_VENDOR_NAME, isDemoModeActive } from "@/lib/demo/demo-session";
import type { VendorTaxDraft } from "@/components/portal/vendor-tax-profile-modal";

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

const DEMO_VENDOR_TAX: VendorTaxDraft = {
  legalName: "Cascade Mechanical LLC",
  businessName: "Cascade Mechanical",
  entityType: "business",
  addressLine1: "4110 Stone Way N",
  addressLine2: "",
  city: "Seattle",
  state: "WA",
  zip: "98103",
  tinType: "ein",
  tin: "",
  w9Attestation: true,
};

/** Vendor Payments — W-9 tax info + Stripe Connect for manager payouts. */
export function VendorPaymentsPanel() {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();

  const [taxDraft, setTaxDraft] = useState<VendorTaxDraft>(() => (demo ? DEMO_VENDOR_TAX : EMPTY_TAX));
  const [taxLoading, setTaxLoading] = useState(() => !demo);
  const [taxSaving, setTaxSaving] = useState(false);
  const [unlinked, setUnlinked] = useState(false);

  useEffect(() => {
    if (demo) return;
    void fetch("/api/vendor/tax-profile", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { profile?: Record<string, unknown> | null; linked?: boolean }) => {
        setUnlinked(data.linked === false);
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
    <ManagerPortalPageShell title="Payments">
      <div className="space-y-6">
        {unlinked ? (
          <p className="rounded-xl border px-4 py-3 text-sm portal-banner-pending" data-attr="vendor-payments-unlinked-banner">
            Waiting on a property manager to connect with you — you&apos;ll be able to save payment info once linked.
          </p>
        ) : null}

        <section>
          <p className="text-sm font-semibold text-foreground">Payout account (Stripe)</p>
          <p className="mt-1 text-xs text-muted">
            Connect your bank account through Stripe so managers can pay you directly when work orders are approved.
          </p>
          <div className="mt-4">
            <PortalStripeConnectPanel
              basePath="/vendor"
              apiBase="/api/vendor/stripe-connect"
              returnPath="/vendor/payments"
              dataAttrPrefix="vendor-stripe-connect"
              variant="embedded"
            />
          </div>
        </section>

        <div className="border-t border-border" />

        <section>
          <p className="text-sm font-semibold text-foreground">Business & tax info (W-9)</p>
          <p className="mt-1 text-xs text-muted">
            Shared with {demo ? DEMO_VENDOR_NAME : "the manager(s)"} who work with you, for 1099 reporting.
          </p>

          {taxLoading ? (
            <p className="mt-4 text-sm text-muted">Loading…</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Legal name
                <Input
                  value={taxDraft.legalName}
                  onChange={(e) => setTaxDraft({ ...taxDraft, legalName: e.target.value })}
                  data-attr="vendor-payments-legal-name"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Business name (optional)
                <Input
                  value={taxDraft.businessName}
                  onChange={(e) => setTaxDraft({ ...taxDraft, businessName: e.target.value })}
                  data-attr="vendor-payments-business-name"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Entity type
                <select
                  className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                  value={taxDraft.entityType}
                  onChange={(e) =>
                    setTaxDraft({ ...taxDraft, entityType: e.target.value as VendorTaxDraft["entityType"] })
                  }
                  data-attr="vendor-payments-entity-type"
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
                  data-attr="vendor-payments-tin-type"
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
                  data-attr="vendor-payments-address1"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
                Address line 2
                <Input
                  value={taxDraft.addressLine2}
                  onChange={(e) => setTaxDraft({ ...taxDraft, addressLine2: e.target.value })}
                  data-attr="vendor-payments-address2"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                City
                <Input
                  value={taxDraft.city}
                  onChange={(e) => setTaxDraft({ ...taxDraft, city: e.target.value })}
                  data-attr="vendor-payments-city"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                State
                <Input
                  value={taxDraft.state}
                  onChange={(e) => setTaxDraft({ ...taxDraft, state: e.target.value })}
                  data-attr="vendor-payments-state"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                ZIP
                <Input
                  value={taxDraft.zip}
                  onChange={(e) => setTaxDraft({ ...taxDraft, zip: e.target.value })}
                  data-attr="vendor-payments-zip"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {taxDraft.tinType === "ein" ? "EIN" : "SSN"} (leave blank to keep existing)
                <Input
                  value={taxDraft.tin}
                  onChange={(e) => setTaxDraft({ ...taxDraft, tin: e.target.value })}
                  data-attr="vendor-payments-tin"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                <input
                  type="checkbox"
                  checked={taxDraft.w9Attestation}
                  onChange={(e) => setTaxDraft({ ...taxDraft, w9Attestation: e.target.checked })}
                  data-attr="vendor-payments-w9-attestation"
                />
                I certify the information above is correct for W-9 / 1099 reporting
              </label>
            </div>
          )}

          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => void saveTax()}
              disabled={taxSaving || taxLoading || unlinked}
              data-attr="vendor-payments-tax-save"
            >
              {taxSaving ? "Saving…" : "Save tax info"}
            </Button>
          </div>
        </section>
      </div>
    </ManagerPortalPageShell>
  );
}
