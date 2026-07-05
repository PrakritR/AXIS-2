"use client";

import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ManagerPortalPageShell, MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
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
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  createPortalRowExpandClick,
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

export type ManagerVendorsPanelHandle = {
  openAdd: () => void;
};

export const ManagerVendorsPanel = forwardRef(function ManagerVendorsPanel(
  {
    embedded = false,
  }: {
    /** When true, render inside Services tab shell (no duplicate page header). */
    embedded?: boolean;
  },
  ref: React.Ref<ManagerVendorsPanelHandle>,
) {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VendorDraft>(EMPTY_DRAFT);
  const [showAdd, setShowAdd] = useState(false);
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);

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

  const openAddForm = useCallback(() => {
    setShowAdd(true);
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }, []);

  useImperativeHandle(ref, () => ({ openAdd: openAddForm }), [openAddForm]);

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

  async function sendInvite(row: ManagerVendorRow) {
    if (!row.email.trim()) {
      showToast("Add an email for this vendor before sending an invite.");
      return;
    }
    setSendingInviteId(row.id);
    try {
      const res = await fetch("/api/portal/send-vendor-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vendorId: row.id, vendorName: row.name, vendorEmail: row.email }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; mailtoHref?: string };
      if (!res.ok || data.ok === false) {
        if (data.mailtoHref) {
          window.open(data.mailtoHref, "_blank");
          showToast(data.error ?? "Email delivery isn't configured — opened your email client instead.");
          return;
        }
        showToast(data.error ?? "Could not send invite.");
        return;
      }
      showToast("Invite sent.");
    } catch {
      showToast("Could not send invite.");
    } finally {
      setSendingInviteId(null);
    }
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

  const renderVendorDetail = (row: ManagerVendorRow) => {
    const editing = editingId === row.id;
    const own = isOwnVendor(row);
    const sharedByOther = !own;
    return editing ? (
      <>
        <VendorForm draft={draft} setDraft={setDraft} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => saveVendor(row.id)}>Save changes</Button>
          <Button type="button" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
        </div>
      </>
    ) : (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 lg:hidden">
          <span className="text-sm font-medium text-foreground">{row.trade || "—"}</span>
          {renderVendorStatusBadges(row)}
        </div>
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
              <Button
                type="button"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => void sendInvite(row)}
                disabled={sendingInviteId === row.id}
                data-attr="vendor-send-invite"
              >
                {sendingInviteId === row.id ? "Sending…" : "Send invite"}
              </Button>
              <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => removeVendor(row.id)}>
                Remove
              </Button>
            </>
          ) : null}
        </div>
      </div>
    );
  };

  const renderVendorStatusBadges = (row: ManagerVendorRow) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
          row.active !== false
            ? "portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]"
            : "bg-accent/30 text-muted ring-border"
        }`}
      >
        {row.active !== false ? "Active" : "Inactive"}
      </span>
      {!isOwnVendor(row) ? (
        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium portal-badge-info ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
          Shared
        </span>
      ) : row.sharedWithManagers ? (
        <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
          Shared with managers
        </span>
      ) : null}
    </div>
  );

  const body = (
    <>
      <Modal
        open={showAdd}
        onClose={() => {
          setShowAdd(false);
          setDraft(EMPTY_DRAFT);
        }}
        title="New vendor"
      >
        <VendorForm draft={draft} setDraft={setDraft} />
        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={() => saveVendor()}>Save vendor</Button>
          <Button type="button" variant="outline" onClick={() => { setShowAdd(false); setDraft(EMPTY_DRAFT); }}>
            Cancel
          </Button>
        </div>
      </Modal>

      {vendors.length === 0 ? (
        <PortalDataTableEmpty message="No vendors yet." icon="vendor" />
      ) : (
        <>
        <div className="space-y-2 lg:hidden">
          {vendors.map((row) => {
            const open = expandedId === row.id;
            return (
              <div key={`vendor-mobile-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left transition-opacity active:opacity-70"
                  onClick={() => setExpandedId(open ? null : row.id)}
                  aria-expanded={open}
                  data-attr="vendor-card-toggle"
                >
                  <p className="min-w-0 flex-1 truncate font-semibold text-foreground">{row.name}</p>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                {open ? (
                  <div className="mt-3 border-t border-border pt-3">{renderVendorDetail(row)}</div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
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
                {vendors.map((row) => {
                  const open = expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={PORTAL_TABLE_TR_EXPANDABLE}
                        onClick={createPortalRowExpandClick(() => setExpandedId(open ? null : row.id))}
                        aria-expanded={open}
                      >
                        <td className={PORTAL_TABLE_TD}>{row.name}</td>
                        <td className={PORTAL_TABLE_TD}>{row.trade || "—"}</td>
                        <td className={PORTAL_TABLE_TD}>{row.phone || "—"}</td>
                        <td className={PORTAL_TABLE_TD}>{row.email || "—"}</td>
                        <td className={PORTAL_TABLE_TD}>{renderVendorStatusBadges(row)}</td>
                      </tr>
                      {open ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                            {renderVendorDetail(row)}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </>
  );

  if (embedded) {
    return <div>{body}</div>;
  }

  return (
    <ManagerPortalPageShell
      title="Vendors"
      subtitle="Share your vendors with other managers if you want."
      titleAside={
        <Button type="button" onClick={openAddForm}>
          Add vendor
        </Button>
      }
    >
      {body}
    </ManagerPortalPageShell>
  );
});

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
