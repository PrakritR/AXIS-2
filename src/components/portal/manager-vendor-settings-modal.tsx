"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  makeVendorId,
  MANAGER_VENDORS_EVENT,
  readManagerVendorCategorySettings,
  readOwnManagerVendorRows,
  saveManagerVendorCategorySettings,
  syncManagerVendorsFromServer,
  upsertManagerVendor,
  setManagerVendorPriority,
  vendorsMatchingTrade,
  type ManagerVendorRow,
} from "@/lib/manager-vendors-storage";
import {
  managerOwnsCatalogVendor,
  searchAxisVendorCatalog,
  vendorCatalogEntryMatchesQuery,
  type AxisCatalogVendor,
} from "@/lib/axis-vendor-catalog";
import { VENDOR_TRADE_OPTIONS } from "@/lib/work-order-taxonomy";

type VendorDraft = {
  name: string;
  trade: string;
  phone: string;
  email: string;
  notes: string;
  sharedWithManagers: boolean;
  vendorPriority: "" | "primary" | "secondary" | "backup";
};

const EMPTY_DRAFT: VendorDraft = {
  name: "",
  trade: VENDOR_TRADE_OPTIONS[0]!,
  phone: "",
  email: "",
  notes: "",
  sharedWithManagers: false,
  vendorPriority: "",
};

function VendorManualForm({
  draft,
  setDraft,
  formIdPrefix,
}: {
  draft: VendorDraft;
  setDraft: (d: VendorDraft) => void;
  formIdPrefix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="text-xs font-semibold text-muted">Name</label>
        <Input className="mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Trade</label>
        <Select className="mt-1" value={draft.trade} onChange={(e) => setDraft({ ...draft, trade: e.target.value })}>
          {VENDOR_TRADE_OPTIONS.map((trade) => (
            <option key={trade} value={trade}>
              {trade}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Phone</label>
        <Input className="mt-1" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Email</label>
        <Input className="mt-1" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-muted">Notes</label>
        <Input className="mt-1" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </div>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-xs font-semibold text-muted">Priority for this trade</legend>
        {(
          [
            { id: "primary", label: "Primary" },
            { id: "secondary", label: "Secondary" },
            { id: "backup", label: "Backup" },
          ] as const
        ).map((opt) => (
          <div key={opt.id} className="flex items-center gap-2">
            <input
              id={`${formIdPrefix}-priority-${opt.id}`}
              type="radio"
              name={`${formIdPrefix}-vendor-priority`}
              checked={draft.vendorPriority === opt.id}
              onChange={() => setDraft({ ...draft, vendorPriority: opt.id })}
            />
            <label htmlFor={`${formIdPrefix}-priority-${opt.id}`} className="text-sm text-foreground">
              {opt.label}
            </label>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            id={`${formIdPrefix}-priority-none`}
            type="radio"
            name={`${formIdPrefix}-vendor-priority`}
            checked={draft.vendorPriority === ""}
            onChange={() => setDraft({ ...draft, vendorPriority: "" })}
          />
          <label htmlFor={`${formIdPrefix}-priority-none`} className="text-sm text-foreground">
            No priority
          </label>
        </div>
      </fieldset>
      <div className="flex items-start gap-2 sm:col-span-2">
        <input
          id={`${formIdPrefix}-shared`}
          type="checkbox"
          checked={draft.sharedWithManagers}
          onChange={(e) => setDraft({ ...draft, sharedWithManagers: e.target.checked })}
        />
        <label htmlFor={`${formIdPrefix}-shared`} className="text-sm leading-6 text-foreground">
          Share with others
          <span className="mt-0.5 block text-xs text-muted">
            Other property managers on Axis can view and assign this vendor.
          </span>
        </label>
      </div>
    </div>
  );
}

export function ManagerVendorSettingsModal({
  open,
  onClose,
  initialTrade,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-select a trade in the category-defaults section. */
  initialTrade?: string;
}) {
  const { showToast } = useAppUi();
  const { userId } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState<VendorDraft>(EMPTY_DRAFT);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [catalogQuery, setCatalogQuery] = useState("");
  const [sharedCatalog, setSharedCatalog] = useState<ManagerVendorRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    void syncManagerVendorsFromServer({ force: true }).then(() => setTick((n) => n + 1));
    setDefaults(readManagerVendorCategorySettings(userId).defaultVendorIdByTrade);
    setDraft({ ...EMPTY_DRAFT, trade: initialTrade?.trim() || VENDOR_TRADE_OPTIONS[0]! });
    setCatalogQuery("");
  }, [open, initialTrade]);

  useEffect(() => {
    if (!open) return;
    const onChange = () => setTick((n) => n + 1);
    window.addEventListener(MANAGER_VENDORS_EVENT, onChange);
    return () => window.removeEventListener(MANAGER_VENDORS_EVENT, onChange);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCatalogLoading(true);
    void fetch("/api/portal-vendors?catalog=1", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return [];
        const body = (await res.json()) as { rows?: ManagerVendorRow[] };
        return Array.isArray(body.rows) ? body.rows : [];
      })
      .then((rows) => {
        if (!cancelled) setSharedCatalog(rows);
      })
      .catch(() => {
        if (!cancelled) setSharedCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const ownVendors = useMemo(() => {
    void tick;
    return readOwnManagerVendorRows(userId);
  }, [tick, userId]);

  const curatedCatalogVisible = useMemo(
    () =>
      searchAxisVendorCatalog(catalogQuery).filter(
        (row) => !managerOwnsCatalogVendor(ownVendors, row.name, row.trade),
      ),
    [catalogQuery, ownVendors],
  );

  const sharedCatalogVisible = useMemo(
    () =>
      sharedCatalog.filter(
        (row) =>
          vendorCatalogEntryMatchesQuery(
            { name: row.name, trade: row.trade, email: row.email, phone: row.phone, notes: row.notes },
            catalogQuery,
          ) && !managerOwnsCatalogVendor(ownVendors, row.name, row.trade),
      ),
    [sharedCatalog, catalogQuery, ownVendors],
  );

  const saveManualVendor = useCallback(() => {
    const name = draft.name.trim();
    if (!name) {
      showToast("Vendor name is required.");
      return;
    }
    if (!userId) return;
    const now = new Date().toISOString();
    const id = makeVendorId();
    upsertManagerVendor(
      {
        id,
        managerUserId: userId,
        name,
        trade: draft.trade.trim() || VENDOR_TRADE_OPTIONS[0]!,
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        notes: draft.notes.trim(),
        active: true,
        sharedWithManagers: draft.sharedWithManagers,
        vendorPriority: draft.vendorPriority || undefined,
        createdAt: now,
        updatedAt: now,
      },
      userId,
    );
    if (draft.vendorPriority === "primary") {
      setManagerVendorPriority(id, "primary", userId);
    }
    setDraft({ ...EMPTY_DRAFT, trade: draft.trade });
    showToast("Vendor added to your account.");
  }, [draft, showToast, userId]);

  const saveDefaults = useCallback(() => {
    if (!userId) return;
    saveManagerVendorCategorySettings({ defaultVendorIdByTrade: defaults }, userId);
    showToast("Default vendors saved.");
  }, [defaults, showToast, userId]);

  const addCatalogVendor = useCallback(
    (entry: AxisCatalogVendor | ManagerVendorRow) => {
      if (!userId) return;
      const now = new Date().toISOString();
      const name = entry.name.trim();
      const trade = entry.trade.trim() || VENDOR_TRADE_OPTIONS[0]!;
      const existing = ownVendors.find(
        (row) => row.name.trim().toLowerCase() === name.toLowerCase() && row.trade === trade,
      );
      if (existing) {
        showToast(`${name} is already on your vendor list.`);
        return;
      }
      upsertManagerVendor(
        {
          id: makeVendorId(),
          managerUserId: userId,
          name,
          trade,
          phone: entry.phone?.trim() ?? "",
          email: entry.email?.trim() ?? "",
          notes: ("notes" in entry ? entry.notes : "")?.trim() ?? "",
          active: true,
          sharedWithManagers: false,
          createdAt: now,
          updatedAt: now,
        },
        userId,
      );
      showToast(`${name} added to your vendors.`);
    },
    [ownVendors, showToast, userId],
  );

  return (
    <Modal open={open} title="Vendor settings" onClose={onClose}>
      <div className="space-y-6 text-sm">
        <section className="space-y-3 rounded-2xl border border-border bg-accent/20 p-4">
          <div>
            <p className="font-semibold text-foreground">Add vendor manually</p>
            <p className="mt-1 text-xs text-muted">Create a vendor on your account for work orders and outgoing payments.</p>
          </div>
          <VendorManualForm draft={draft} setDraft={setDraft} formIdPrefix="vendor-settings-manual" />
          <Button type="button" className="rounded-full" data-attr="vendor-settings-add-manual" onClick={saveManualVendor}>
            Add vendor
          </Button>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-accent/20 p-4">
          <div>
            <p className="font-semibold text-foreground">Defaults by category</p>
            <p className="mt-1 text-xs text-muted">
              Pick a default vendor for each major trade. Outgoing payments pre-select the matching default.
            </p>
          </div>
          <ul className="space-y-3">
            {VENDOR_TRADE_OPTIONS.map((trade) => {
              const matches = vendorsMatchingTrade(ownVendors, trade);
              return (
                <li key={trade} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
                  <span className="font-medium text-foreground">{trade}</span>
                  <Select
                    value={defaults[trade] ?? ""}
                    onChange={(e) =>
                      setDefaults((prev) => {
                        const next = { ...prev };
                        const value = e.target.value;
                        if (value) next[trade] = value;
                        else delete next[trade];
                        return next;
                      })
                    }
                  >
                    <option value="">No default</option>
                    {matches.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </Select>
                </li>
              );
            })}
          </ul>
          <Button type="button" variant="primary" className="rounded-full" data-attr="vendor-settings-save-defaults" onClick={saveDefaults}>
            Save defaults
          </Button>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-accent/20 p-4">
          <div>
            <p className="font-semibold text-foreground">Axis catalog</p>
            <p className="mt-1 text-xs text-muted">
              Search curated vendors and vendors shared by other managers on Axis, then add them to your account.
            </p>
          </div>
          <Input
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            placeholder="Search by name, trade, city, or ZIP…"
            data-attr="vendor-catalog-search"
          />
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {catalogLoading ? <p className="text-xs text-muted">Searching catalog…</p> : null}
            {sharedCatalogVisible.map((row) => (
              <div
                key={`shared-${row.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
              >
                <div>
                  <p className="font-medium text-foreground">{row.name}</p>
                  <p className="text-xs text-muted">
                    {row.trade || "—"}
                    {row.email ? ` · ${row.email}` : ""}
                  </p>
                  <p className="text-[11px] text-muted">Shared on Axis</p>
                </div>
                <Button type="button" variant="outline" className="h-8 rounded-full text-xs" onClick={() => addCatalogVendor(row)}>
                  Add
                </Button>
              </div>
            ))}
            {curatedCatalogVisible.map((row) => (
              <div
                key={row.catalogId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
              >
                <div>
                  <p className="font-medium text-foreground">{row.name}</p>
                  <p className="text-xs text-muted">
                    {row.trade} · {row.city} · {row.zip}
                  </p>
                  <p className="text-[11px] text-muted">Axis catalog</p>
                </div>
                <Button type="button" variant="outline" className="h-8 rounded-full text-xs" onClick={() => addCatalogVendor(row)}>
                  Add
                </Button>
              </div>
            ))}
            {!catalogLoading && sharedCatalogVisible.length === 0 && curatedCatalogVisible.length === 0 ? (
              <p className="text-xs text-muted">No catalog matches yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </Modal>
  );
}
