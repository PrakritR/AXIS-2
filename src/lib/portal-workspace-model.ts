import type { PortalKind } from "@/lib/portal-types";
import {
  demoKpis,
  demoLeasePipelineRows,
  demoManagerSubscriberRows,
  demoResidentLeaseRows,
  demoResidentPropertyRows,
} from "@/data/demo-portal";
import { adminPropertyRows, applicantRows, inboxPreviewRows, paymentRows, workOrderRows } from "@/data/mock-tables";
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
  emptyState?: { title: string; description?: string; actionLabel?: string };
  showToolbar?: boolean;
  showQuickLinks?: boolean;
};

function actionsFor(portal: PortalKind, section: string): WorkspaceAction[] {
  const common: WorkspaceAction[] = [
    {
      label: "Refresh",
      kind: "toast",
      message: "Refreshed (demo).",
    },
  ];

  if (portal === "manager" || portal === "owner") {
    if (section === "properties") {
      if (portal === "owner") {
        return [
          {
            label: "View linked inventory",
            kind: "toast",
            message: "Only properties your manager linked appear here. Approvals and edits go through your manager.",
          },
          ...common,
        ];
      }
      return [
        { label: "Add property", kind: "toast", message: "Opening add flow…" },
        {
          label: "Export CSV",
          kind: "modal",
          message: "Exports will connect to your database later.",
        },
        ...common,
      ];
    }
    if (section === "applicants" || section === "applications") {
      if (portal === "owner") {
        return [
          {
            label: "View application",
            kind: "modal",
            message: "Owner accounts cannot approve or deny applications. Ask your manager to take action.",
          },
          ...common,
        ];
      }
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
    }
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
    if (section === "work-orders") {
      if (portal === "owner") {
        return [
          {
            label: "Request work order",
            kind: "toast",
            message: "Requests route to your property manager for triage (demo).",
          },
          ...common,
        ];
      }
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
    }
    if (section === "documents")
      return [
        {
          label: "Upload lease",
          kind: "modal",
          message: "Uploads are disabled in the scaffold.",
        },
        ...common,
      ];
    if (section === "managers" && portal === "owner") {
      return [
        {
          label: "Contact manager",
          kind: "toast",
          message: "Demo — verified messaging will appear here.",
        },
        {
          label: "View agreement",
          kind: "modal",
          message: "Management agreements will be stored per property.",
        },
        ...common,
      ];
    }
  }

  if (portal === "resident") {
    if (section === "properties" || section === "applications" || section === "lease" || section === "calendar")
      return [
        {
          label: "Refresh",
          kind: "toast",
          message: "Demo refresh — no live data yet.",
        },
      ];
    if (section === "payments")
      return [
        { label: "Add payment", kind: "toast", message: "Demo — no charges are processed." },
        {
          label: "Download receipt",
          kind: "modal",
          message: "Receipts will generate from real ledgers later.",
        },
        {
          label: "Refresh",
          kind: "toast",
          message: "Refreshed payments (demo).",
        },
      ];
    if (section === "work-orders")
      return [
        {
          label: "Submit work order",
          kind: "toast",
          message: "Request captured for demo purposes.",
        },
        {
          label: "Refresh",
          kind: "toast",
          message: "Refreshed work orders (demo).",
        },
      ];
    if (section === "inbox")
      return [
        {
          label: "New message",
          kind: "modal",
          message: "Messaging is not wired yet.",
        },
        {
          label: "Refresh",
          kind: "toast",
          message: "Refreshed inbox (demo).",
        },
      ];
    if (section === "profile")
      return [
        {
          label: "Edit info",
          kind: "toast",
          message: "Profile editing is not connected yet.",
        },
      ];
  }

  if (portal === "admin") {
    if (section === "properties")
      return [
        {
          label: "Refresh",
          kind: "toast",
          message: "Refreshed property queue (demo).",
        },
      ];
    if (
      section === "managers" ||
      section === "leases" ||
      section === "events" ||
      section === "applications" ||
      section === "payments" ||
      section === "work-orders"
    )
      return [
        {
          label: "Refresh",
          kind: "toast",
          message: "Refreshed (demo).",
        },
      ];
    if (section === "inbox")
      return [
        {
          label: "New message",
          kind: "modal",
          message: "Messaging is not wired yet.",
        },
        {
          label: "Refresh",
          kind: "toast",
          message: "Refreshed inbox (demo).",
        },
      ];
    if (section === "profile")
      return [
        {
          label: "Edit info",
          kind: "toast",
          message: "Profile editing is not connected yet.",
        },
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
  const eyebrow = `${portal === "manager" ? "Manager" : portal === "owner" ? "Owner" : portal === "resident" ? "Resident" : "Admin"} workspace`;

  if (section === "dashboard") {
    return {
      eyebrow,
      title: "Dashboard",
      subtitle:
        portal === "owner"
          ? ""
          : portal === "admin" || portal === "resident"
            ? ""
            : "Snapshot of operations. Numbers are illustrative until integrations are enabled.",
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
                  hint:
                    portal === "owner"
                      ? "Linked properties your manager assigned"
                      : "Across your portfolio",
                },
                {
                  label: "Applicants (new)",
                  value: "5",
                  hint: portal === "owner" ? "Visible for your units (read-only where restricted)" : "Needs first review",
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
    if (portal === "admin") {
      return {
        eyebrow,
        title: "Inbox",
        subtitle: "",
        showToolbar: false,
        showQuickLinks: false,
        actions: actionsFor(portal, section),
        columns: [
          { key: "from", label: "From" },
          { key: "subject", label: "Subject" },
          { key: "preview", label: "Preview" },
          { key: "when", label: "When" },
          { key: "unread", label: "Unread" },
        ],
        rows: inboxPreviewRows as unknown as Record<string, string>[],
      };
    }

    if (portal === "resident") {
      return {
        eyebrow,
        title: "Inbox",
        subtitle: "",
        showToolbar: false,
        showQuickLinks: false,
        actions: actionsFor(portal, section),
        columns: [
          { key: "from", label: "From" },
          { key: "subject", label: "Subject" },
          { key: "preview", label: "Preview" },
          { key: "when", label: "When" },
          { key: "unread", label: "Unread" },
        ],
        rows: inboxPreviewRows as unknown as Record<string, string>[],
      };
    }

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
    if (portal === "resident") {
      return {
        eyebrow,
        title: "Payments",
        subtitle: "",
        kpis: [
          { label: "Pending", value: demoKpis.payments.pending, hint: "" },
          { label: "Overdue", value: demoKpis.payments.overdue, hint: "" },
          { label: "Paid", value: demoKpis.payments.paid, hint: "" },
        ],
        showToolbar: false,
        showQuickLinks: false,
        actions: actionsFor(portal, section),
        columns: [
          { key: "resident", label: "Resident" },
          { key: "unit", label: "Unit" },
          { key: "amount", label: "Amount" },
          { key: "due", label: "Due" },
          { key: "status", label: "Status" },
        ],
        rows: paymentRows as unknown as Record<string, string>[],
      };
    }

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
    if (portal === "resident") {
      return {
        eyebrow,
        title: "Work orders",
        subtitle: "",
        kpis: [
          { label: "Open", value: demoKpis.workOrders.open, hint: "" },
          { label: "Scheduled", value: demoKpis.workOrders.scheduled, hint: "" },
          { label: "Completed", value: demoKpis.workOrders.completed, hint: "" },
        ],
        showToolbar: false,
        showQuickLinks: false,
        actions: actionsFor(portal, section),
        columns: [
          { key: "id", label: "ID" },
          { key: "unit", label: "Unit" },
          { key: "title", label: "Title" },
          { key: "priority", label: "Priority" },
          { key: "status", label: "Status" },
        ],
        rows: workOrderRows as unknown as Record<string, string>[],
      };
    }

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

  if (portal === "resident" && section === "properties") {
    return {
      eyebrow,
      title: "Properties",
      subtitle: "",
      showToolbar: false,
      showQuickLinks: false,
      actions: actionsFor(portal, section),
      columns: [
        { key: "building", label: "Building" },
        { key: "unit", label: "Unit" },
        { key: "manager", label: "Manager" },
        { key: "since", label: "Since" },
      ],
      rows: demoResidentPropertyRows as unknown as Record<string, string>[],
    };
  }

  if (portal === "resident" && section === "applications") {
    return {
      eyebrow,
      title: "Applications",
      subtitle: "",
      kpis: [
        { label: "Pending", value: demoKpis.applications.pending, hint: "" },
        { label: "Approved", value: demoKpis.applications.approved, hint: "" },
        { label: "Rejected", value: demoKpis.applications.rejected, hint: "" },
      ],
      showToolbar: false,
      showQuickLinks: false,
      actions: actionsFor(portal, section),
      columns: [
        { key: "name", label: "Applicant" },
        { key: "property", label: "Property" },
        { key: "stage", label: "Stage" },
        { key: "score", label: "Score" },
      ],
      rows: applicantRows as unknown as Record<string, string>[],
    };
  }

  if (portal === "resident" && section === "lease") {
    return {
      eyebrow,
      title: "Lease",
      subtitle: "",
      kpis: [
        { label: "Manager review", value: demoKpis.leases.managerReview, hint: "" },
        { label: "Admin review", value: demoKpis.leases.adminReview, hint: "" },
        { label: "With resident", value: demoKpis.leases.withResident, hint: "" },
        { label: "Signed", value: demoKpis.leases.signed, hint: "" },
      ],
      showToolbar: false,
      showQuickLinks: false,
      actions: actionsFor(portal, section),
      columns: [
        { key: "document", label: "Document" },
        { key: "status", label: "Status" },
        { key: "updated", label: "Updated" },
      ],
      rows: demoResidentLeaseRows as unknown as Record<string, string>[],
    };
  }

  if (portal === "admin" && section === "properties") {
    return {
      eyebrow,
      title: "Properties",
      subtitle: "",
      showToolbar: false,
      showQuickLinks: false,
      actions: actionsFor(portal, section),
      columns: [
        { key: "name", label: "Property" },
        { key: "manager", label: "Manager" },
        { key: "units", label: "Units" },
        { key: "status", label: "Status" },
      ],
      rows: adminPropertyRows as unknown as Record<string, string>[],
    };
  }

  if (portal === "admin" && section === "managers") {
    return {
      eyebrow,
      title: "Managers",
      subtitle: "",
      kpis: [
        { label: "Current subscribers", value: demoKpis.managers.current, hint: "" },
        { label: "Past subscribers", value: demoKpis.managers.past, hint: "" },
      ],
      showToolbar: false,
      showQuickLinks: false,
      actions: actionsFor(portal, section),
      columns: [
        { key: "name", label: "Manager" },
        { key: "org", label: "Organization" },
        { key: "portfolio", label: "Portfolio" },
        { key: "status", label: "Status" },
        { key: "since", label: "Since" },
      ],
      rows: demoManagerSubscriberRows as unknown as Record<string, string>[],
    };
  }

  if (portal === "admin" && section === "leases") {
    return {
      eyebrow,
      title: "Leases",
      subtitle: "",
      kpis: [
        { label: "Manager review", value: demoKpis.leases.managerReview, hint: "" },
        { label: "Admin review", value: demoKpis.leases.adminReview, hint: "" },
        { label: "With resident", value: demoKpis.leases.withResident, hint: "" },
        { label: "Signed", value: demoKpis.leases.signed, hint: "" },
      ],
      showToolbar: false,
      showQuickLinks: false,
      actions: actionsFor(portal, section),
      columns: [
        { key: "resident", label: "Resident" },
        { key: "unit", label: "Unit / home" },
        { key: "stage", label: "Stage" },
        { key: "updated", label: "Updated" },
      ],
      rows: demoLeasePipelineRows as unknown as Record<string, string>[],
    };
  }

  if (portal === "admin" && section === "applications") {
    return {
      eyebrow,
      title: "Applications",
      subtitle: "",
      kpis: [
        { label: "Pending", value: demoKpis.applications.pending, hint: "" },
        { label: "Approved", value: demoKpis.applications.approved, hint: "" },
        { label: "Rejected", value: demoKpis.applications.rejected, hint: "" },
      ],
      showToolbar: false,
      showQuickLinks: false,
      actions: actionsFor(portal, section),
      columns: [
        { key: "name", label: "Applicant" },
        { key: "property", label: "Property" },
        { key: "stage", label: "Stage" },
        { key: "score", label: "Score" },
      ],
      rows: applicantRows as unknown as Record<string, string>[],
    };
  }

  if (portal === "admin" && section === "payments") {
    return {
      eyebrow,
      title: "Payments",
      subtitle: "",
      kpis: [
        { label: "Pending", value: demoKpis.payments.pending, hint: "" },
        { label: "Overdue", value: demoKpis.payments.overdue, hint: "" },
        { label: "Paid", value: demoKpis.payments.paid, hint: "" },
      ],
      showToolbar: false,
      showQuickLinks: false,
      actions: [
        { label: "Add payment", kind: "toast", message: "Demo — no charges are processed." },
        ...actionsFor(portal, section),
      ],
      columns: [
        { key: "resident", label: "Resident" },
        { key: "unit", label: "Unit" },
        { key: "amount", label: "Amount" },
        { key: "due", label: "Due" },
        { key: "status", label: "Status" },
      ],
      rows: paymentRows as unknown as Record<string, string>[],
    };
  }

  if (portal === "admin" && section === "work-orders") {
    return {
      eyebrow,
      title: "Work orders",
      subtitle: "",
      kpis: [
        { label: "Open", value: demoKpis.workOrders.open, hint: "" },
        { label: "Scheduled", value: demoKpis.workOrders.scheduled, hint: "" },
        { label: "Completed", value: demoKpis.workOrders.completed, hint: "" },
      ],
      showToolbar: false,
      showQuickLinks: false,
      actions: actionsFor(portal, section),
      columns: [
        { key: "id", label: "ID" },
        { key: "unit", label: "Unit" },
        { key: "title", label: "Title" },
        { key: "priority", label: "Priority" },
        { key: "status", label: "Status" },
      ],
      rows: workOrderRows as unknown as Record<string, string>[],
    };
  }

  if (portal === "resident" && section === "calendar") {
    return {
      eyebrow,
      title: "Calendar",
      subtitle: "",
      kpis: [
        { label: "Today", value: demoKpis.residentCalendar.today, hint: "Events" },
        { label: "This week", value: demoKpis.residentCalendar.week, hint: "" },
        { label: "This month", value: demoKpis.residentCalendar.month, hint: "" },
        { label: "Total", value: demoKpis.residentCalendar.total, hint: "" },
      ],
      showToolbar: false,
      showQuickLinks: false,
      columns: [
        { key: "item", label: "Item" },
        { key: "window", label: "Window" },
        { key: "owner", label: "Owner" },
      ],
      rows: [
        {
          item: "Move-in orientation",
          window: "Sat · 11:00 AM",
          owner: "Community",
        },
        {
          item: "Rent due reminder",
          window: "May 1",
          owner: "Payments",
        },
      ],
      actions: actionsFor(portal, section),
    };
  }

  if (section === "leasing") {
    return {
      eyebrow,
      title: "Leasing",
      subtitle: `Pipeline view. Tab: ${humanize(tabId)}.`,
      notes:
        "Leasing boards are intentionally lightweight here; wire real statuses when your backend is ready.",
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

  if ((section === "calendar" || section === "analytics") && portal !== "resident" && portal !== "admin") {
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

  if (portal === "resident" && section === "profile") {
    return {
      eyebrow,
      title: "Profile",
      subtitle: "",
      showToolbar: false,
      showQuickLinks: false,
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [
        { field: "Full name", value: "—" },
        { field: "Email", value: "—" },
        { field: "Phone", value: "—" },
        { field: "Resident ID", value: "—" },
      ],
      actions: actionsFor(portal, section),
    };
  }

  if (portal === "admin" && section === "profile") {
    return {
      eyebrow,
      title: "Profile",
      subtitle: "",
      showToolbar: false,
      showQuickLinks: false,
      columns: [
        { key: "field", label: "Field" },
        { key: "value", label: "Value" },
      ],
      rows: [
        { field: "Full name", value: "—" },
        { field: "Email", value: "—" },
        { field: "Phone", value: "—" },
        { field: "Admin ID", value: "—" },
      ],
      actions: actionsFor(portal, section),
    };
  }

  if (
    section === "documents" ||
    section === "settings" ||
    (section === "profile" && portal !== "admin" && portal !== "resident")
  ) {
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
