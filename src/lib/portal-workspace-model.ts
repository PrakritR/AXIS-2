import type { PortalKind } from "@/lib/portal-types";
import {
  adminPropertyRows,
  announcementRows,
  applicantRows,
  inboxPreviewRows,
  paymentRows,
  workOrderRows,
} from "@/data/mock-tables";
export type WorkspaceAction = {
  label: string;
  kind: "toast" | "modal";
  message: string;
};

export type WorkspaceModel = {
  eyebrow: string;
  title: string;
  subtitle: string;
  kpis?: { label: string; value: string; hint: string }[];
  columns?: { key: string; label: string }[];
  rows?: Record<string, string>[];
  actions: WorkspaceAction[];
  notes?: string;
};

function actionsFor(portal: PortalKind, section: string): WorkspaceAction[] {
  const common: WorkspaceAction[] = [
    {
      label: "Refresh (demo)",
      kind: "toast",
      message: "Demo refresh — no live data yet.",
    },
  ];

  if (portal === "manager") {
    if (section === "properties")
      return [
        { label: "Add property", kind: "toast", message: "Opening add flow…" },
        {
          label: "Export CSV",
          kind: "modal",
          message: "Exports will connect to your database later.",
        },
        ...common,
      ];
    if (section === "applicants")
      return [
        {
          label: "Approve applicant",
          kind: "toast",
          message: "Applicant approved (demo).",
        },
        {
          label: "Request docs",
          kind: "modal",
          message: "Messaging will route through Inbox once connected.",
        },
        ...common,
      ];
    if (section === "payments")
      return [
        {
          label: "View payment",
          kind: "modal",
          message: "Stripe wiring is intentionally disabled in this shell.",
        },
        { label: "Send reminder", kind: "toast", message: "Reminder queued…" },
        ...common,
      ];
    if (section === "work-orders")
      return [
        {
          label: "Create work order",
          kind: "toast",
          message: "WO draft created (demo).",
        },
        {
          label: "Assign vendor",
          kind: "modal",
          message: "Vendor assignment is a placeholder for now.",
        },
        ...common,
      ];
    if (section === "announcements")
      return [
        {
          label: "Post announcement",
          kind: "toast",
          message: "Announcement posted to demo feed.",
        },
        ...common,
      ];
    if (section === "documents")
      return [
        {
          label: "Upload lease",
          kind: "modal",
          message: "Uploads are disabled in the scaffold.",
        },
        ...common,
      ];
  }

  if (portal === "resident") {
    if (section === "payments")
      return [
        { label: "Pay rent", kind: "toast", message: "Payments are demo-only." },
        {
          label: "Download receipt",
          kind: "modal",
          message: "Receipts will generate from real ledgers later.",
        },
        ...common,
      ];
    if (section === "work-orders")
      return [
        {
          label: "Submit work order",
          kind: "toast",
          message: "Request captured for demo purposes.",
        },
        ...common,
      ];
    if (section === "inbox")
      return [
        {
          label: "Compose message",
          kind: "modal",
          message: "Messaging is not wired yet.",
        },
        ...common,
      ];
  }

  if (portal === "admin") {
    if (section === "properties")
      return [
        {
          label: "Approve property",
          kind: "toast",
          message: "Property approved (demo).",
        },
        {
          label: "Reject",
          kind: "modal",
          message: "Rejection reasons will be tracked in audit logs.",
        },
        ...common,
      ];
    if (section === "tools")
      return [
        {
          label: "Run Airtable sync",
          kind: "modal",
          message: "Airtable sync is a placeholder in this build.",
        },
        {
          label: "Open Stripe dashboard",
          kind: "modal",
          message: "Stripe is intentionally not connected.",
        },
        ...common,
      ];
    if (section === "users")
      return [
        {
          label: "Manage roles",
          kind: "modal",
          message: "RBAC editor ships in a later milestone.",
        },
        ...common,
      ];
  }

  return [
    {
      label: "Primary action",
      kind: "toast",
      message: "Action recorded (demo).",
    },
    ...common,
  ];
}

export function buildPortalWorkspaceModel(
  portal: PortalKind,
  section: string,
  tabId: string,
): WorkspaceModel {
  const eyebrow = `${portal === "manager" ? "Manager" : portal === "resident" ? "Resident" : "Admin"} workspace`;

  if (section === "dashboard") {
    return {
      eyebrow,
      title: "Dashboard",
      subtitle:
        "Snapshot of operations. Numbers are illustrative until integrations are enabled.",
      kpis:
        portal === "resident"
          ? [
              {
                label: "Rent due",
                value: "$950.00",
                hint: "Due May 1 · autopay off",
              },
              {
                label: "Open requests",
                value: "1",
                hint: "Maintenance: sink leak",
              },
              {
                label: "Unread messages",
                value: "3",
                hint: "Inbox previews below",
              },
            ]
          : portal === "admin"
            ? [
                {
                  label: "Occupancy",
                  value: "92.4%",
                  hint: "Portfolio-wide (demo)",
                },
                {
                  label: "Open work orders",
                  value: "37",
                  hint: "Across all managers",
                },
                {
                  label: "Pending approvals",
                  value: "6",
                  hint: "Properties + leases",
                },
              ]
            : [
                {
                  label: "Active listings",
                  value: "14",
                  hint: "Across your portfolio",
                },
                {
                  label: "Applicants (new)",
                  value: "5",
                  hint: "Needs first review",
                },
                {
                  label: "Late payments",
                  value: "2",
                  hint: "Automations off",
                },
              ],
      columns: [
        { key: "title", label: "Signal" },
        { key: "detail", label: "Detail" },
        { key: "owner", label: "Owner" },
      ],
      rows: [
        {
          title: "Leasing velocity",
          detail: "3 applications submitted in the last 24h",
          owner: "Leasing",
        },
        {
          title: "Maintenance SLA",
          detail: "Average first response: 6h 12m",
          owner: "Operations",
        },
        {
          title: "Resident sentiment",
          detail: "4.7 / 5 from last 30 tour surveys",
          owner: "Experience",
        },
      ],
      actions: actionsFor(portal, section),
    };
  }

  if (section === "inbox") {
    return {
      eyebrow,
      title: "Inbox",
      subtitle:
        "Thread previews are mocked. Compose opens a placeholder modal.",
      columns: [
        { key: "from", label: "From" },
        { key: "subject", label: "Subject" },
        { key: "preview", label: "Preview" },
        { key: "when", label: "When" },
        { key: "unread", label: "Unread" },
      ],
      rows: inboxPreviewRows.map((r) => ({
        from: r.from,
        subject: r.subject,
        preview: r.preview,
        when: r.when,
        unread: r.unread,
      })),
      actions: actionsFor(portal, section),
    };
  }

  if (section === "payments") {
    return {
      eyebrow,
      title: "Payments",
      subtitle: "Ledger rows are illustrative. No charges are processed.",
      columns: [
        { key: "resident", label: "Resident" },
        { key: "unit", label: "Unit" },
        { key: "amount", label: "Amount" },
        { key: "due", label: "Due" },
        { key: "status", label: "Status" },
      ],
      rows: paymentRows as unknown as Record<string, string>[],
      actions: actionsFor(portal, section),
    };
  }

  if (section === "applicants") {
    return {
      eyebrow,
      title: "Applicants",
      subtitle: "Pipeline view with mock screening labels.",
      columns: [
        { key: "name", label: "Applicant" },
        { key: "property", label: "Property" },
        { key: "stage", label: "Stage" },
        { key: "score", label: "Score" },
      ],
      rows: applicantRows as unknown as Record<string, string>[],
      actions: actionsFor(portal, section),
    };
  }

  if (section === "work-orders") {
    return {
      eyebrow,
      title: "Work orders",
      subtitle: "Statuses update locally for demo walkthroughs.",
      columns: [
        { key: "id", label: "ID" },
        { key: "unit", label: "Unit" },
        { key: "title", label: "Title" },
        { key: "priority", label: "Priority" },
        { key: "status", label: "Status" },
      ],
      rows: workOrderRows as unknown as Record<string, string>[],
      actions: actionsFor(portal, section),
    };
  }

  if (section === "announcements") {
    return {
      eyebrow,
      title: "Announcements",
      subtitle: "Broadcast center with scheduled sends (mock).",
      columns: [
        { key: "title", label: "Title" },
        { key: "audience", label: "Audience" },
        { key: "posted", label: "Posted" },
        { key: "status", label: "Status" },
      ],
      rows: announcementRows as unknown as Record<string, string>[],
      actions: actionsFor(portal, section),
    };
  }

  if (portal === "admin" && section === "properties") {
    return {
      eyebrow,
      title: "Properties",
      subtitle: "Admin view across managers and portfolios.",
      columns: [
        { key: "name", label: "Property" },
        { key: "manager", label: "Manager" },
        { key: "units", label: "Units" },
        { key: "status", label: "Status" },
      ],
      rows: adminPropertyRows as unknown as Record<string, string>[],
      actions: actionsFor(portal, section),
    };
  }

  if (
    section === "calendar" ||
    section === "analytics" ||
    section === "leasing"
  ) {
    return {
      eyebrow,
      title: humanize(section),
      subtitle: `Calendar/analytics widgets render here. Tab: ${humanize(tabId)}.`,
      notes:
        "This section is intentionally visual-only: heatmaps, charts, and drag-and-drop scheduling will plug in later.",
      columns: [
        { key: "item", label: "Item" },
        { key: "window", label: "Window" },
        { key: "owner", label: "Owner" },
      ],
      rows: [
        {
          item: "Tour block",
          window: "Sat · 10:00–2:00",
          owner: "Leasing",
        },
        {
          item: "Lease countersign",
          window: "Due Fri",
          owner: "Admin",
        },
        {
          item: "Vendor follow-up",
          window: "Due Wed",
          owner: "Maintenance",
        },
      ],
      actions: actionsFor(portal, section),
    };
  }

  if (section === "documents" || section === "profile" || section === "settings") {
    return {
      eyebrow,
      title: humanize(section),
      subtitle: `Form layout + file shelves. Tab: ${humanize(tabId)}.`,
      columns: [
        { key: "name", label: "Name" },
        { key: "type", label: "Type" },
        { key: "updated", label: "Updated" },
      ],
      rows: [
        { name: "Lease - Pioneer 12A.pdf", type: "Lease", updated: "Apr 2" },
        { name: "Move-in checklist.pdf", type: "Move-in", updated: "Mar 30" },
        { name: "HOA rules.pdf", type: "Property", updated: "Mar 12" },
      ],
      actions: actionsFor(portal, section),
    };
  }

  return {
    eyebrow,
    title: `${humanize(section)} · ${humanize(tabId)}`,
    subtitle:
      "Seeded rows for layout testing. Replace with queries when backend wiring lands.",
    columns: [
      { key: "record", label: "Record" },
      { key: "state", label: "State" },
      { key: "owner", label: "Owner" },
    ],
    rows: [
      { record: "Sample A", state: "Ready", owner: "Axis" },
      { record: "Sample B", state: "Queued", owner: "Manager" },
      { record: "Sample C", state: "Blocked", owner: "Admin" },
    ],
    actions: actionsFor(portal, section),
  };
}

function humanize(slug: string) {
  return slug
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}
