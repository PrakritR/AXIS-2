"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";
import {
  readBugFeedbackRows,
  submitBugFeedbackReport,
  syncBugFeedbackFromServer,
  type BugFeedbackReporterRole,
  type BugFeedbackType,
  type BugSeverity,
  type PortalBugFeedbackRow,
} from "@/lib/portal-bug-feedback";
import { usePortalSession } from "@/hooks/use-portal-session";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function PortalBugFeedbackPanel({
  reporterRole,
}: {
  reporterRole: BugFeedbackReporterRole;
}) {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const [formType, setFormType] = useState<BugFeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("medium");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PortalBugFeedbackRow[]>(() => readBugFeedbackRows());

  const refresh = useCallback(async () => {
    const result = await syncBugFeedbackFromServer({ force: true });
    setRows(result.rows);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const onRefresh = () => void refresh();
    window.addEventListener(ADMIN_UI_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_UI_EVENT, onRefresh);
  }, [refresh]);

  const myRows = useMemo(() => {
    const uid = session.userId ?? "";
    const email = (session.email ?? "").trim().toLowerCase();
    return rows.filter(
      (r) => (uid && r.reporterUserId === uid) || (email && r.reporterEmail === email),
    );
  }, [rows, session.email, session.userId]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setSteps("");
    setSeverity("medium");
  };

  const handleSubmit = async () => {
    const userId = session.userId;
    const email = (session.email ?? "").trim();
    if (!userId || !email.includes("@")) {
      showToast("Sign in to submit a report.");
      return;
    }
    if (!title.trim()) {
      showToast("Add a short title.");
      return;
    }
    if (!description.trim()) {
      showToast("Describe the issue or feedback.");
      return;
    }
    setBusy(true);
    try {
      await submitBugFeedbackReport({
        type: formType,
        reporterUserId: userId,
        reporterName: email,
        reporterEmail: email,
        reporterRole,
        title,
        description,
        stepsToReproduce: formType === "bug" ? steps : undefined,
        severity: formType === "bug" ? severity : undefined,
      });
      resetForm();
      await refresh();
      showToast(formType === "bug" ? "Bug report sent. Our team will review it." : "Thanks for your feedback!");
    } catch {
      showToast("Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ManagerPortalPageShell title="Feedback">
      <p className="mb-6 text-sm text-muted">
        Report something broken or share ideas to improve Axis.
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFormType("bug")}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                formType === "bug"
                  ? "bg-primary text-white"
                  : "border border-border bg-card text-muted hover:bg-accent/30"
              }`}
            >
              Report a bug
            </button>
            <button
              type="button"
              onClick={() => setFormType("feedback")}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                formType === "feedback"
                  ? "bg-primary text-white"
                  : "border border-border bg-card text-muted hover:bg-accent/30"
              }`}
            >
              Send feedback
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Title *</p>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={formType === "bug" ? "e.g. Payments page shows blank after save" : "e.g. Easier way to duplicate a room"}
                className="bg-card"
              />
            </div>
            {formType === "bug" ? (
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">Severity</p>
                <Select value={severity} onChange={(e) => setSeverity(e.target.value as BugSeverity)} className="bg-card">
                  <option value="low">Low — cosmetic or minor</option>
                  <option value="medium">Medium — workaround exists</option>
                  <option value="high">High — blocks important work</option>
                  <option value="critical">Critical — cannot use the product</option>
                </Select>
              </div>
            ) : null}
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">
                {formType === "bug" ? "What happened? *" : "Your feedback *"}
              </p>
              <Textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  formType === "bug"
                    ? "What you expected vs what you saw, and any error messages."
                    : "What would help you or your residents?"
                }
                className="bg-card"
              />
            </div>
            {formType === "bug" ? (
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">Steps to reproduce (optional)</p>
                <Textarea
                  rows={3}
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  placeholder="1. Go to… 2. Click… 3. See error"
                  className="bg-card"
                />
              </div>
            ) : null}
            <Button type="button" className="rounded-full" disabled={busy} onClick={() => void handleSubmit()}>
              {busy ? "Sending…" : formType === "bug" ? "Submit bug report" : "Send feedback"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-accent/30 p-4">
          <p className="text-sm font-semibold text-foreground">Your submissions</p>
          <p className="mt-1 text-xs text-muted">We review every report. Status updates appear here.</p>
          <div className="mt-4 space-y-3">
            {myRows.length === 0 ? (
              <p className="text-xs text-muted">Nothing submitted yet.</p>
            ) : (
              <>
                <SubmissionGroup title="Bug reports" rows={myRows.filter((r) => r.type === "bug")} empty="No bug reports yet." />
                <SubmissionGroup title="Feedback" rows={myRows.filter((r) => r.type === "feedback")} empty="No feedback yet." />
              </>
            )}
          </div>
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}

function SubmissionGroup({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: PortalBugFeedbackRow[];
  empty: string;
}) {
  return (
    <details className="group rounded-xl border border-border bg-card open:shadow-sm" open={rows.length > 0}>
      <summary className="cursor-pointer list-none px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted">
              {rows.length}
            </span>
            <span className="text-[10px] font-semibold text-primary group-open:hidden">Open</span>
            <span className="hidden text-[10px] font-semibold text-muted group-open:inline">Hide</span>
          </div>
        </div>
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-2.5">
        {rows.length === 0 ? (
          <p className="text-[11px] text-muted">{empty}</p>
        ) : (
          rows.slice(0, 8).map((row) => (
            <div key={row.id} className="rounded-lg border border-border bg-accent/30 p-2.5">
              <p className="text-xs font-semibold text-foreground">{row.title}</p>
              <p className="mt-1 line-clamp-2 text-[11px] text-muted">{row.description}</p>
              <p className="mt-2 text-[10px] text-muted">
                {formatWhen(row.createdAt)} · {row.status}
              </p>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
