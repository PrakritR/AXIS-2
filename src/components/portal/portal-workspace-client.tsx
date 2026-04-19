"use client";

import { Breadcrumbs, type Crumb } from "@/components/layout/breadcrumbs";
import { ManagerSectionShell, PortalPropertyFilter, type ShellAction } from "@/components/portal/manager-section-shell";
import { PORTAL_KPI_LABEL, PORTAL_KPI_VALUE } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState, Toolbar } from "@/components/ui/empty-state";
import type { WorkspaceAction, WorkspaceModel } from "@/lib/portal-workspace-model";
import type { PortalKind } from "@/lib/portal-types";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { TabNav, type TabItem } from "@/components/ui/tabs";

function toShellActions(
  actions: WorkspaceAction[],
  openModal: (p: { title: string; body: string }) => void,
  showToast: (m: string) => void,
): ShellAction[] {
  let primaryPlaced = false;
  return actions.map((a) => {
    const label = a.label.replace(/\s*\(demo\)\s*$/i, "").trim();
    const isRefresh = /^refresh/i.test(label);
    const variant: "primary" | "outline" = isRefresh || primaryPlaced ? "outline" : "primary";
    if (!isRefresh && variant === "primary") primaryPlaced = true;
    return {
      label,
      variant,
      onClick: () =>
        a.kind === "modal" ? openModal({ title: label, body: a.message }) : showToast(a.message),
    };
  });
}

export function PortalWorkspaceClient({
  portalKind,
  portalLabel,
  tabId,
  tabs,
  model,
  breadcrumbs,
}: {
  portalKind?: PortalKind;
  portalLabel: string;
  tabId: string;
  tabs: TabItem[];
  model: WorkspaceModel;
  breadcrumbs: Crumb[];
}) {
  const { showToast, openModal } = useAppUi();
  const isCompactPortalShell = portalKind === "admin" || portalKind === "resident";
  const useSectionShell = portalKind === "admin" || portalKind === "resident";
  const showToolbar = model.showToolbar !== false;
  const showQuickLinks = model.showQuickLinks !== false;

  const hasTable = Boolean(model.columns && model.rows?.length);

  const shellActions = toShellActions(model.actions, openModal, showToast);

  const legacyKpiGrid =
    !useSectionShell && model.kpis?.length ? (
      <div
        className={
          model.kpis.length === 5
            ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            : model.kpis.length === 4
              ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              : model.kpis.length === 2
                ? "grid gap-3 md:grid-cols-2"
                : "grid gap-4 md:grid-cols-3"
        }
      >
        {model.kpis.map((k) => (
          <Card key={k.label} className="border-slate-200/80 bg-white p-5 shadow-sm">
            <p className={PORTAL_KPI_VALUE}>{k.value}</p>
            <p className={PORTAL_KPI_LABEL}>{k.label}</p>
            {k.hint ? <p className="mt-2 text-sm text-muted">{k.hint}</p> : null}
          </Card>
        ))}
      </div>
    ) : null;

  const workspaceBody = (
    <>
      {tabs.length ? (
        <div className={isCompactPortalShell ? "mb-1" : ""}>
          <TabNav items={tabs} activeId={tabId} />
        </div>
      ) : null}

      {legacyKpiGrid}

      {showToolbar ? (
        <Toolbar>
          <div className="flex w-full flex-col gap-2 md:flex-row md:items-center">
            <Input placeholder="Search (demo)" className="md:max-w-md" />
            <Select className="md:max-w-xs">
              <option>All statuses</option>
              <option>Active</option>
              <option>Archived</option>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="md:ml-auto"
              onClick={() => showToast("Filters are demo-only")}
            >
              Filters
            </Button>
          </div>
        </Toolbar>
      ) : null}

      {!isCompactPortalShell && model.notes ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">{model.notes}</div>
      ) : null}

      {!isCompactPortalShell ? (
        <div className="flex flex-wrap gap-2">
          {model.actions.map((a) => (
            <Button
              key={a.label}
              type="button"
              variant={a.kind === "modal" ? "secondary" : "primary"}
              onClick={() =>
                a.kind === "modal" ? openModal({ title: a.label, body: a.message }) : showToast(a.message)
              }
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}

      {hasTable ? (
        <DataTable columns={model.columns!} rows={model.rows!} />
      ) : model.emptyState ? (
        <EmptyState
          variant={isCompactPortalShell ? "panel" : "default"}
          title={model.emptyState.title}
          description={model.emptyState.description ?? ""}
          actionLabel={model.emptyState.actionLabel}
          onAction={
            model.emptyState.actionLabel
              ? () => showToast("Thanks — this is a demo empty state.")
              : undefined
          }
        />
      ) : (
        <EmptyState
          variant={isCompactPortalShell ? "panel" : "default"}
          title="Nothing to show yet"
          description={
            isCompactPortalShell ? "" : "This tab is wired for navigation. Add your query + UI states when backend work begins."
          }
          actionLabel={isCompactPortalShell ? undefined : "Show sample toast"}
          onAction={isCompactPortalShell ? undefined : () => showToast("Thanks — this is a demo empty state.")}
        />
      )}

      {showQuickLinks ? (
        <Card className="p-5">
          <p className="text-sm font-semibold text-foreground">Quick links</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => showToast("Coming soon")}>
              Export
            </Button>
            <Button type="button" variant="outline" onClick={() => showToast("Coming soon")}>
              Bulk actions
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => openModal({ title: "Keyboard shortcuts", body: "Demo only." })}
            >
              Shortcuts
            </Button>
          </div>
        </Card>
      ) : null}
    </>
  );

  const hideAdminPropertyFilter = portalKind === "admin" && model.title === "Inbox";

  const headerFilters =
    portalKind === "admin" && !hideAdminPropertyFilter ? (
      <PortalPropertyFilter residents={model.title === "Payments"} applications={model.title === "Work orders"} />
    ) : portalKind === "resident" ? (
      <PortalPropertyFilter residents={model.title === "Payments"} />
    ) : null;

  if (useSectionShell) {
    const kpisForShell =
      model.kpis?.map((k) => ({
        value: k.value,
        label: k.label,
      })) ?? undefined;

    return (
      <ManagerSectionShell
        title={model.title}
        filters={headerFilters ?? undefined}
        actions={shellActions}
        kpis={kpisForShell}
      >
        <div className="space-y-5">{workspaceBody}</div>
      </ManagerSectionShell>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={breadcrumbs} />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{model.eyebrow}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{model.title}</h1>
            {model.subtitle.trim() ? <p className="mt-2 max-w-prose text-sm text-muted">{model.subtitle}</p> : null}
          </div>
          <Badge tone="info">{portalLabel}</Badge>
        </div>
      </div>

      {workspaceBody}
    </div>
  );
}
