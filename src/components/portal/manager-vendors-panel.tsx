"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ManagerPortalPageShell, MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  MANAGER_VENDORS_EVENT,
  makeVendorId,
  readManagerVendorRows,
  syncManagerVendorsFromServer,
  upsertManagerVendor,
  deleteManagerVendorRow,
  type ManagerVendorRow,
} from "@/lib/manager-vendors-storage";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
} from "@/components/portal/portal-data-table";

const TRADE_OPTIONS = [
  "General maintenance",
  "Plumbing",
  "Electrical",
  "HVAC",
  "Appliance repair",
  "Landscaping",
  "Cleaning",
  "Pest control",
  "Other",
];

type VendorDraft = {
  name: string;
  trade: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
  sharedWithManagers: boolean;
};

const EMPTY_DRAFT: VendorDraft = {
  name: "",
  trade: TRADE_OPTIONS[0]!,
  phone: "",
  email: "",
  notes: "",
  active: true,
  sharedWithManagers: false,
};

export function ManagerVendorsPanel({ basePath }: { basePath: string }) {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VendorDraft>(EMPTY_DRAFT);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    void syncManagerVendorsFromServer({ force: true });
  }, [authReady, userId]);

  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    window.addEventListener(MANAGER_VENDORS_EVENT, onChange);
    return () => window.removeEventListener(MANAGER_VENDORS_EVENT, onChange);
  }, []);

  const vendors = useMemo(() => {
    void tick;
    return readManagerVendorRows().sort((a, b) => a.name.localeCompare(b.name));
  }, [tick]);

  const isOwnVendor = useCallback(
    (row: ManagerVendorRow) => !row.managerUserId || row.managerUserId === userId,
    [userId],
  );

  const activeCount = vendors.filter((v) => v.active !== false).length;

  function startEdit(row: ManagerVendorRow) {
    if (!isOwnVendor(row)) {
      showToast("This vendor was shared by another manager and can't be edited.");
      return;
    }
    setEditingId(row.id);
    setDraft({
      name: row.name,
      trade: row.trade || TRADE_OPTIONS[0]!,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      active: row.active !== false,
      sharedWithManagers: row.sharedWithManagers === true,
    });
    setExpandedId(row.id);
  }

  function saveVendor(existingId?: string) {
    const name = draft.name.trim();
    if (!name) {
      showToast("Vendor name is required.");
      return;
    }
    const id = existingId ?? makeVendorId();
    const now = new Date().toISOString();
    const existing = vendors.find((v) => v.id === id);
    upsertManagerVendor(
      {
        id,
        managerUserId: userId ?? null,
        name,
        trade: draft.trade.trim() || TRADE_OPTIONS[0]!,
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        notes: draft.notes.trim(),
        active: draft.active,
        sharedWithManagers: draft.sharedWithManagers,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
      userId,
    );
    setEditingId(null);
    setShowAdd(false);
    setDraft(EMPTY_DRAFT);
    showToast(existingId ? "Vendor updated." : "Vendor added.");
  }

  function removeVendor(id: string) {
    const row = vendors.find((v) => v.id === id);
    if (row && !isOwnVendor(row)) {
      showToast("This vendor was shared by another manager and can't be removed.");
      return;
    }
    if (!deleteManagerVendorRow(id, userId)) return;
    if (expandedId === id) setExpandedId(null);
    showToast("Vendor removed.");
  }

  return (
    <ManagerPortalPageShell
      title="Vendors"
      subtitle={`${activeCount} active vendor${activeCount === 1 ? "" : "s"} for work order assignment. Share your vendors with other managers if you want.`}
      titleAside={
        <Button type="button" onClick={() => { setShowAdd(true); setDraft(EMPTY_DRAFT); setEditingId(null); }}>
          Add vendor
        </Button>
      }
    >
      {showAdd ? (
        <div className="mb-6 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">New vendor</p>
          <VendorForm draft={draft} setDraft={setDraft} />
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={() => saveVendor()}>Save vendor</Button>
            <Button type="button" variant="outline" onClick={() => { setShowAdd(false); setDraft(EMPTY_DRAFT); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className={PORTAL_DATA_TABLE_WRAP}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className={PORTAL_TABLE_HEAD_ROW}>
                <th className={MANAGER_TABLE_TH}>Name</th>
                <th className={MANAGER_TABLE_TH}>Trade</th>
                <th className={MANAGER_TABLE_TH}>Phone</th>
                <th className={MANAGER_TABLE_TH}>Email</th>
                <th className={MANAGER_TABLE_TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <PortalDataTableEmpty message="No vendors yet. Add contractors you use for maintenance." />
              ) : (
                vendors.map((row) => {
                  const open = expandedId === row.id;
                  const editing = editingId === row.id;
                  const own = isOwnVendor(row);
                  const sharedByOther = !own;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`${PORTAL_TABLE_TR} ${PORTAL_TABLE_ROW_TOGGLE_CLASS}`}
                        onClick={() => setExpandedId(open ? null : row.id)}
                      >
                        <td className={PORTAL_TABLE_TD}>{row.name}</td>
                        <td className={PORTAL_TABLE_TD}>{row.trade || "—"}</td>
                        <td className={PORTAL_TABLE_TD}>{row.phone || "—"}</td>
                        <td className={PORTAL_TABLE_TD}>{row.email || "—"}</td>
                        <td className={PORTAL_TABLE_TD}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                                row.active !== false
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                  : "bg-accent/30 text-muted ring-border"
                              }`}
                            >
                              {row.active !== false ? "Active" : "Inactive"}
                            </span>
                            {sharedByOther ? (
                              <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                                Shared
                              </span>
                            ) : row.sharedWithManagers ? (
                              <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                                Shared with managers
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                            {editing ? (
                              <>
                                <VendorForm draft={draft} setDraft={setDraft} />
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <Button type="button" onClick={() => saveVendor(row.id)}>Save changes</Button>
                                  <Button type="button" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                                </div>
                              </>
                            ) : (
                              <div className="space-y-3">
                                {sharedByOther ? (
                                  <p className="text-sm text-muted">
                                    Shared by another manager on Axis. You can view contact details but can&apos;t edit or remove this vendor.
                                  </p>
                                ) : null}
                                {row.notes ? <p className="text-sm text-muted">{row.notes}</p> : null}
                                <div className="flex flex-wrap gap-2">
                                  {row.phone ? (
                                    <a href={`tel:${row.phone}`} className="text-sm font-medium text-primary hover:underline">
                                      Call {row.phone}
                                    </a>
                                  ) : null}
                                  {row.email ? (
                                    <a href={`mailto:${row.email}`} className="text-sm font-medium text-primary hover:underline">
                                      Email {row.email}
                                    </a>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {own ? (
                                    <>
                                      <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => startEdit(row)}>
                                        Edit
                                      </Button>
                                      <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => removeVendor(row.id)}>
                                        Remove
                                      </Button>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}

function VendorForm({
  draft,
  setDraft,
}: {
  draft: VendorDraft;
  setDraft: (d: VendorDraft) => void;
}) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <label className="text-xs font-semibold text-muted">Name</label>
        <Input className="mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Trade</label>
        <Select
          className="mt-1"
          value={draft.trade}
          onChange={(e) => setDraft({ ...draft, trade: e.target.value })}
        >
          {TRADE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
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
      <div className="flex items-center gap-2 sm:col-span-2">
        <input
          id="vendor-active"
          type="checkbox"
          checked={draft.active}
          onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
        />
        <label htmlFor="vendor-active" className="text-sm text-foreground">Active (available for assignment)</label>
      </div>
      <div className="flex items-start gap-2 sm:col-span-2">
        <input
          id="vendor-shared"
          type="checkbox"
          checked={draft.sharedWithManagers}
          onChange={(e) => setDraft({ ...draft, sharedWithManagers: e.target.checked })}
        />
        <label htmlFor="vendor-shared" className="text-sm leading-6 text-foreground">
          Share with other managers on Axis
          <span className="mt-0.5 block text-xs text-muted">
            Other property managers can view and assign this vendor to work orders. You can turn this off anytime.
          </span>
        </label>
      </div>
    </div>
  );
}
