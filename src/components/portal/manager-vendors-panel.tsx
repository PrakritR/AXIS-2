"use client";

import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ManagerPortalPageShell,
  MANAGER_TABLE_TH,
  PORTAL_HEADER_PRIMARY_ACTION_BTN_RESPONSIVE,
} from "@/components/portal/portal-metrics";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { collectLinkedOwnerIdsForModule } from "@/lib/manager-portfolio-access";
import {
  MANAGER_VENDORS_EVENT,
  readOwnManagerVendorRows,
  syncManagerVendorsFromServer,
  deleteManagerVendorRow,
  setManagerVendorActive,
  setManagerVendorPriority,
  type ManagerVendorRow,
} from "@/lib/manager-vendors-storage";
import { ManagerVendorCatalogModal } from "@/components/portal/manager-vendor-catalog-modal";
import { ManagerVendorDefaultsModal } from "@/components/portal/manager-vendor-defaults-modal";
import { ManagerVendorInviteModal } from "@/components/portal/manager-vendor-invite-modal";
import { ManagerVendorFormModal } from "@/components/portal/manager-vendor-form-modal";
import { stageManagerComposePrefill } from "@/lib/manager-compose-prefill";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";
import {
  PORTAL_LIST_ADD_ICONS,
  PORTAL_LIST_ADD_ROW_WRAP_CLASS,
  PortalListAddRow,
} from "@/components/portal/portal-list-add-row";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_TD,
  PortalTableInlineExpand,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";

export type ManagerVendorsPanelHandle = {
  openCatalog: () => void;
  openDefaults: (trade?: string) => void;
  openAddVendor: (trade?: string) => void;
};

export function ManagerVendorsToolbar({
  onCatalog,
  onDefaults,
  onAdd,
}: {
  onCatalog: () => void;
  onDefaults: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className={PORTAL_HEADER_PRIMARY_ACTION_BTN_RESPONSIVE}
        onClick={onCatalog}
        data-attr="manager-vendor-catalog-open"
      >
        Vendor catalog
      </Button>
      <Button
        type="button"
        variant="outline"
        className={PORTAL_HEADER_PRIMARY_ACTION_BTN_RESPONSIVE}
        onClick={onDefaults}
        data-attr="manager-vendor-defaults-open"
      >
        Defaults
      </Button>
      <Button
        type="button"
        variant="outline"
        className={PORTAL_HEADER_PRIMARY_ACTION_BTN_RESPONSIVE}
        onClick={onAdd}
        data-attr="manager-vendor-add"
      >
        Add
      </Button>
    </div>
  );
}

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
  const router = useRouter();
  const portalBase = usePaidPortalBasePath();
  const { userId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [defaultsTrade, setDefaultsTrade] = useState<string | undefined>(undefined);
  const [inviteVendor, setInviteVendor] = useState<ManagerVendorRow | null>(null);
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [vendorFormMode, setVendorFormMode] = useState<"add" | "edit">("add");
  const [editingVendor, setEditingVendor] = useState<ManagerVendorRow | null>(null);
  const [addTrade, setAddTrade] = useState<string | undefined>(undefined);

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
    return readOwnManagerVendorRows(userId, undefined, { includeOwnerIds: collectLinkedOwnerIdsForModule(userId ?? "", "services") }).sort((a, b) => a.name.localeCompare(b.name));
  }, [tick, userId]);

  const openCatalogForm = useCallback(() => {
    setShowCatalog(true);
  }, []);

  const openDefaultsForm = useCallback((trade?: string) => {
    setDefaultsTrade(trade);
    setShowDefaults(true);
  }, []);

  const openAddVendorForm = useCallback((trade?: string) => {
    setVendorFormMode("add");
    setEditingVendor(null);
    setAddTrade(trade);
    setVendorFormOpen(true);
  }, []);

  const openEditVendorForm = useCallback((row: ManagerVendorRow) => {
    setVendorFormMode("edit");
    setEditingVendor(row);
    setAddTrade(undefined);
    setVendorFormOpen(true);
    setExpandedId(row.id);
  }, []);

  const openVendorOnboardingCompose = useCallback(
    async (vendor: { id: string; name: string; email: string }) => {
      const email = vendor.email.trim().toLowerCase();
      if (!email) {
        showToast("Add an email address on the vendor to send the onboarding invite.");
        return;
      }
      try {
        const res = await fetch("/api/portal/vendor-invite-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            vendorId: vendor.id,
            vendorName: vendor.name,
            vendorEmail: email,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          subject?: string;
          body?: string;
          error?: string;
        };
        if (!res.ok || !data.subject?.trim() || !data.body?.trim()) {
          showToast(data.error ?? "Could not prepare the vendor onboarding message.");
          return;
        }
        stageManagerComposePrefill({
          subject: data.subject,
          body: data.body,
          recipientEmail: email,
        });
        router.push(`${portalBase}/communication/active`);
      } catch {
        showToast("Could not prepare the vendor onboarding message.");
      }
    },
    [portalBase, router, showToast],
  );

  useImperativeHandle(
    ref,
    () => ({
      openCatalog: openCatalogForm,
      openDefaults: openDefaultsForm,
      openAddVendor: openAddVendorForm,
    }),
    [openCatalogForm, openDefaultsForm, openAddVendorForm],
  );

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
    } else {
      showToast("Priority cleared.");
    }
  }

  const renderVendorQuickControls = (row: ManagerVendorRow) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="text-xs font-semibold text-muted">Status</label>
        <Select
          className="mt-1"
          value={row.active !== false ? "active" : "inactive"}
          onChange={(e) => updateVendorStatus(row, e.target.value === "active")}
          data-attr="vendor-status-select"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Priority</label>
        <Select
          className="mt-1"
          value={row.vendorPriority ?? ""}
          onChange={(e) =>
            updateVendorPriority(
              row,
              e.target.value === "primary" || e.target.value === "secondary" ? e.target.value : undefined,
            )
          }
          data-attr="vendor-priority-select"
        >
          <option value="">Standard</option>
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
        </Select>
      </div>
    </div>
  );

  const renderVendorDetail = (row: ManagerVendorRow) => (
    <div className="space-y-3">
      {row.notes ? <p className="text-sm text-muted">{row.notes}</p> : null}
      {renderVendorQuickControls(row)}
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
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-full text-xs"
          onClick={() => openEditVendorForm(row)}
          data-attr="vendor-edit"
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-full text-xs"
          onClick={() => setInviteVendor(row)}
          data-attr="vendor-send-invite"
        >
          Send invite
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 rounded-full border-red-200 text-xs text-red-700 hover:bg-red-50"
          onClick={() => removeVendor(row.id)}
          data-attr="vendor-remove"
        >
          Remove
        </Button>
      </div>
    </div>
  );

  const vendorListAddRow = (
    <div className={PORTAL_LIST_ADD_ROW_WRAP_CLASS}>
      <PortalListAddRow
        label="Add"
        icon={PORTAL_LIST_ADD_ICONS.vendor}
        onClick={() => openAddVendorForm()}
        dataAttr="vendors-list-add"
      />
    </div>
  );

  const vendorTable = (
    <>
      <div className="space-y-2 lg:hidden">
        {vendors.map((row) => {
          const open = expandedId === row.id;
          return (
            <div key={`vendor-mobile-${row.id}`} className={PORTAL_MOBILE_CARD_CLASS}>
              <button
                type="button"
                className="flex w-full gap-2 text-left"
                onClick={() => setExpandedId(open ? null : row.id)}
                aria-expanded={open}
                data-attr="vendor-card-toggle"
              >
                <div className="min-w-0 flex-1">
                  <PortalTableInlineExpand expanded={open} className="font-semibold text-foreground">
                    <span className="truncate">{row.name}</span>
                  </PortalTableInlineExpand>
                </div>
              </button>
              {open ? <div className="mt-3 border-t border-border pt-3">{renderVendorDetail(row)}</div> : null}
            </div>
          );
        })}
      </div>
      <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
        <div className={PORTAL_DATA_TABLE_SCROLL}>
          <table className="w-full table-fixed border-collapse text-left text-sm">
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
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>
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
  );

  const body = (
    <>
      <ManagerVendorFormModal
        open={vendorFormOpen}
        mode={vendorFormMode}
        vendor={editingVendor}
        initialTrade={addTrade}
        onClose={() => {
          setVendorFormOpen(false);
          setEditingVendor(null);
          setAddTrade(undefined);
        }}
        showToast={showToast}
        onBrowseCatalog={() => openCatalogForm()}
        onAdded={openVendorOnboardingCompose}
        onDeleted={() => {
          if (editingVendor && expandedId === editingVendor.id) setExpandedId(null);
          setEditingVendor(null);
        }}
      />
      <ManagerVendorCatalogModal
        open={showCatalog}
        onClose={() => setShowCatalog(false)}
      />
      <ManagerVendorDefaultsModal
        open={showDefaults}
        onClose={() => {
          setShowDefaults(false);
          setDefaultsTrade(undefined);
        }}
        initialTrade={defaultsTrade}
        onAddForCategory={(trade) => openAddVendorForm(trade)}
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

      {vendors.length === 0 ? vendorListAddRow : vendorTable}
    </>
  );

  if (embedded) {
    return <div>{body}</div>;
  }

  return (
    <ManagerPortalPageShell
      title="Services"
      titleAside={
        <ManagerVendorsToolbar
          onCatalog={openCatalogForm}
          onDefaults={() => openDefaultsForm()}
          onAdd={() => openAddVendorForm()}
        />
      }
    >
      {body}
    </ManagerPortalPageShell>
  );
});
