"use client";

import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
  ManagerPortalPageShell,
  MANAGER_TABLE_TH,
  PORTAL_TOOLBAR_SELECT,
  PortalToolbarSelectWrap,
} from "@/components/portal/portal-metrics";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  MANAGER_VENDORS_EVENT,
  makeVendorId,
  readOwnManagerVendorRows,
  syncManagerVendorsFromServer,
  upsertManagerVendor,
  deleteManagerVendorRow,
  setManagerVendorActive,
  setManagerVendorPriority,
  type ManagerVendorRow,
} from "@/lib/manager-vendors-storage";
import { ManagerVendorSettingsModal } from "@/components/portal/manager-vendor-settings-modal";
import { ManagerVendorInviteModal } from "@/components/portal/manager-vendor-invite-modal";
import { PORTAL_DATA_TABLE, PortalDataTableColGroup, portalTableColumnPercents, PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableInlineExpand,
  createPortalRowExpandClick,} from "@/components/portal/portal-data-table";
import { VENDOR_TRADE_OPTIONS } from "@/lib/work-order-taxonomy";

const TRADE_OPTIONS: readonly string[] = VENDOR_TRADE_OPTIONS;

type VendorDraft = {
  name: string;
  trade: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
  sharedWithManagers: boolean;
  vendorPriority: "" | "primary" | "secondary" | "backup";
};

const EMPTY_DRAFT: VendorDraft = {
  name: "",
  trade: TRADE_OPTIONS[0]!,
  phone: "",
  email: "",
  notes: "",
  active: true,
  sharedWithManagers: false,
  vendorPriority: "",
};

export type ManagerVendorsPanelHandle = {
  openSettings: (trade?: string) => void;
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
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTrade, setSettingsTrade] = useState<string | undefined>(undefined);
  const [inviteVendor, setInviteVendor] = useState<ManagerVendorRow | null>(null);

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
    return readOwnManagerVendorRows(userId).sort((a, b) => a.name.localeCompare(b.name));
  }, [tick, userId]);

  const openSettingsForm = useCallback((trade?: string) => {
    setSettingsTrade(trade);
    setShowSettings(true);
  }, []);

  useImperativeHandle(ref, () => ({ openSettings: openSettingsForm }), [openSettingsForm]);

  function startEdit(row: ManagerVendorRow) {
    setEditingId(row.id);
    setDraft({
      name: row.name,
      trade: row.trade || TRADE_OPTIONS[0]!,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      active: row.active !== false,
      sharedWithManagers: row.sharedWithManagers === true,
      vendorPriority: row.vendorPriority ?? "",
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
        vendorPriority: draft.vendorPriority || undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
      userId,
    );
    if (draft.vendorPriority === "primary") {
      setManagerVendorPriority(id, "primary", userId);
    }
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    showToast(existingId ? "Vendor updated." : "Vendor added.");
  }

  function removeVendor(id: string) {
    if (!deleteManagerVendorRow(id, userId)) return;
    if (expandedId === id) setExpandedId(null);
    showToast("Vendor removed.");
  }

  function updateVendorStatus(row: ManagerVendorRow, active: boolean) {
    setManagerVendorActive(row.id, active, userId);
    showToast(active ? "Vendor marked active." : "Vendor marked inactive.");
  }

  function updateVendorPriority(row: ManagerVendorRow, priority: ManagerVendorRow["vendorPriority"]) {
    setManagerVendorPriority(row.id, priority, userId);
    if (priority === "primary") {
      showToast(`${row.name} is now the primary ${row.trade || "vendor"}.`);
    } else if (priority === "secondary") {
      showToast(`${row.name} marked as secondary.`);
    } else if (priority === "backup") {
      showToast(`${row.name} marked as backup.`);
    }
  }

  const renderVendorDetail = (row: ManagerVendorRow) => {
    const editing = editingId === row.id;
    const priorityValue = row.vendorPriority ?? "backup";
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
        {row.notes ? <p className="text-sm text-muted">{row.notes}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 shrink-0 rounded-full px-3 text-xs"
            onClick={() => startEdit(row)}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 shrink-0 rounded-full px-3 text-xs"
            onClick={() => setInviteVendor(row)}
            data-attr="vendor-send-invite"
          >
            Send invite
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 shrink-0 rounded-full px-3 text-xs"
            onClick={() => removeVendor(row.id)}
          >
            Remove
          </Button>
          <PortalToolbarSelectWrap className="shrink-0">
            <select
              className={`${PORTAL_TOOLBAR_SELECT} h-8 min-w-[5.5rem] text-xs font-semibold`}
              value={row.active !== false ? "active" : "inactive"}
              onChange={(e) => updateVendorStatus(row, e.target.value === "active")}
              data-attr="vendor-status-select"
              aria-label="Status"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </PortalToolbarSelectWrap>
          <PortalToolbarSelectWrap className="shrink-0">
            <select
              className={`${PORTAL_TOOLBAR_SELECT} h-8 min-w-[5.5rem] text-xs font-semibold`}
              value={priorityValue}
              onChange={(e) =>
                updateVendorPriority(row, e.target.value as "primary" | "secondary" | "backup")
              }
              data-attr="vendor-priority-select"
              aria-label="Priority"
            >
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="backup">Backup</option>
            </select>
          </PortalToolbarSelectWrap>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
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
      </div>
    );
  };

  const body = (
    <>
      <ManagerVendorSettingsModal
        open={showSettings}
        onClose={() => {
          setShowSettings(false);
          setSettingsTrade(undefined);
        }}
        initialTrade={settingsTrade}
      />
      <ManagerVendorInviteModal
        open={inviteVendor !== null}
        vendor={inviteVendor}
        onClose={() => setInviteVendor(null)}
        onSent={() => {
          setInviteVendor(null);
          showToast("Invite sent.");
        }}
        showToast={showToast}
      />

      {vendors.length === 0 ? (
        <PortalDataTableEmpty message="No vendors on your account yet. Open Vendor settings to add one." icon="vendor" />
      ) : (
        <>
        <div className="space-y-2 lg:hidden">
          {vendors.map((row) => {
            const open = expandedId === row.id;
            return (
              <div key={`vendor-mobile-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
                <button
                  type="button"
                  className="w-full text-left transition-opacity active:opacity-70"
                  onClick={() => setExpandedId(open ? null : row.id)}
                  aria-expanded={open}
                  data-attr="vendor-card-toggle"
                >
                  <PortalTableInlineExpand expanded={open} className="font-semibold text-foreground">
                    <span className="truncate">{row.name}</span>
                  </PortalTableInlineExpand>
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
            <table className={PORTAL_DATA_TABLE}>
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={MANAGER_TABLE_TH}>Name</th>
                  <th className={MANAGER_TABLE_TH}>Trade</th>
                  <th className={MANAGER_TABLE_TH}>Phone</th>
                  <th className={MANAGER_TABLE_TH}>Email</th>
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
                        <td className={PORTAL_TABLE_TD}>
                          <PortalTableInlineExpand expanded={open}>{row.name}</PortalTableInlineExpand>
                        </td>
                        <td className={PORTAL_TABLE_TD}>{row.trade || "—"}</td>
                        <td className={PORTAL_TABLE_TD}>{row.phone || "—"}</td>
                        <td className={PORTAL_TABLE_TD}>{row.email || "—"}</td>
                      </tr>
                      {open ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={4} className={PORTAL_TABLE_DETAIL_CELL}>
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
      subtitle="Vendors on your account for work orders and outgoing payments."
      titleAside={
        <Button type="button" onClick={() => openSettingsForm()} data-attr="manager-vendor-settings-open">
          Vendor settings
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
          id="vendor-priority-primary"
          type="radio"
          name="vendor-priority"
          checked={draft.vendorPriority === "primary"}
          onChange={() => setDraft({ ...draft, vendorPriority: "primary" })}
        />
        <label htmlFor="vendor-priority-primary" className="text-sm text-foreground">Primary for this trade</label>
      </div>
      <div className="flex items-start gap-2 sm:col-span-2">
        <input
          id="vendor-priority-secondary"
          type="radio"
          name="vendor-priority"
          checked={draft.vendorPriority === "secondary"}
          onChange={() => setDraft({ ...draft, vendorPriority: "secondary" })}
        />
        <label htmlFor="vendor-priority-secondary" className="text-sm text-foreground">Secondary for this trade</label>
      </div>
      <div className="flex items-start gap-2 sm:col-span-2">
        <input
          id="vendor-priority-backup"
          type="radio"
          name="vendor-priority"
          checked={draft.vendorPriority === "backup"}
          onChange={() => setDraft({ ...draft, vendorPriority: "backup" })}
        />
        <label htmlFor="vendor-priority-backup" className="text-sm text-foreground">Backup for this trade</label>
      </div>
      <div className="flex items-start gap-2 sm:col-span-2">
        <input
          id="vendor-priority-standard"
          type="radio"
          name="vendor-priority"
          checked={draft.vendorPriority === ""}
          onChange={() => setDraft({ ...draft, vendorPriority: "" })}
        />
        <label htmlFor="vendor-priority-standard" className="text-sm text-foreground">No priority</label>
      </div>
      <div className="flex items-start gap-2 sm:col-span-2">
        <input
          id="vendor-shared"
          type="checkbox"
          checked={draft.sharedWithManagers}
          onChange={(e) => setDraft({ ...draft, sharedWithManagers: e.target.checked })}
        />
        <label htmlFor="vendor-shared" className="text-sm leading-6 text-foreground">
          Share with others
          <span className="mt-0.5 block text-xs text-muted">
            Other property managers can view and assign this vendor to work orders. You can turn this off anytime.
          </span>
        </label>
      </div>
    </div>
  );
}
