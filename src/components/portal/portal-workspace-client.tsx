"use client";

import { Breadcrumbs, type Crumb } from "@/components/layout/breadcrumbs";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState, Toolbar } from "@/components/ui/empty-state";
import type { WorkspaceModel } from "@/lib/portal-workspace-model";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { TabNav, type TabItem } from "@/components/ui/tabs";

export function PortalWorkspaceClient({
  portalLabel,
  basePath,
  section,
  tabId,
  sectionTitle,
  tabs,
  model,
  breadcrumbs,
}: {
  portalLabel: string;
  basePath: string;
  section: string;
  tabId: string;
  sectionTitle: string;
  tabs: TabItem[];
  model: WorkspaceModel;
  breadcrumbs: Crumb[];
}) {
  const { showToast, openModal } = useAppUi();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={breadcrumbs} />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {model.eyebrow}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {model.title}
            </h1>
            <p className="mt-2 max-w-prose text-sm text-muted">{model.subtitle}</p>
          </div>
          <Badge tone="info">{portalLabel}</Badge>
        </div>
      </div>

      {tabs.length ? (
        <TabNav items={tabs} activeId={tabId} />
      ) : null}

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

      {model.kpis?.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {model.kpis.map((k) => (
            <Card key={k.label} className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {k.label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{k.value}</p>
              <p className="mt-2 text-sm text-muted">{k.hint}</p>
            </Card>
          ))}
        </div>
      ) : null}

      {model.notes ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          {model.notes}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {model.actions.map((a) => (
          <Button
            key={a.label}
            type="button"
            variant={a.kind === "modal" ? "secondary" : "primary"}
            onClick={() =>
              a.kind === "modal"
                ? openModal({ title: a.label, body: a.message })
                : showToast(a.message)
            }
          >
            {a.label}
          </Button>
        ))}
      </div>

      {model.columns && model.rows?.length ? (
        <DataTable columns={model.columns} rows={model.rows} />
      ) : (
        <EmptyState
          title="Nothing to show yet"
          description="This tab is wired for navigation. Add your query + UI states when backend work begins."
          actionLabel="Show sample toast"
          onAction={() => showToast("Thanks — this is a demo empty state.")}
        />
      )}

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
    </div>
  );
}
