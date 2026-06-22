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
    const next = await syncBugFeedbackFromServer({ force: true });
    setRows(next);
  }, []);

  useEffect(() => {
    void refresh();
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
    <ManagerPortalPageShell title="Bugs & feedback">
      <p className="mb-6 text-sm text-slate-500">
        Report something broken or share ideas to improve Axis.
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFormType("bug")}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                formType === "bug"
                  ? "bg-primary text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Send feedback
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Title *</p>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={formType === "bug" ? "e.g. Payments page shows blank after save" : "e.g. Easier way to duplicate a room"}
                className="bg-white"
              />
            </div>
            {formType === "bug" ? (
              <div>
                <p className="mb-1 text-[11px] font-medium text-slate-600">Severity</p>
                <Select value={severity} onChange={(e) => setSeverity(e.target.value as BugSeverity)} className="bg-white">
                  <option value="low">Low — cosmetic or minor</option>
                  <option value="medium">Medium — workaround exists</option>
                  <option value="high">High — blocks important work</option>
                  <option value="critical">Critical — cannot use the product</option>
                </Select>
              </div>
            ) : null}
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">
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
                className="bg-white"
              />
            </div>
            {formType === "bug" ? (
              <div>
                <p className="mb-1 text-[11px] font-medium text-slate-600">Steps to reproduce (optional)</p>
                <Textarea
                  rows={3}
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  placeholder="1. Go to… 2. Click… 3. See error"
                  className="bg-white"
                />
              </div>
            ) : null}
            <Button type="button" className="rounded-full" disabled={busy} onClick={() => void handleSubmit()}>
              {busy ? "Sending…" : formType === "bug" ? "Submit bug report" : "Send feedback"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-sm font-semibold text-slate-900">Your submissions</p>
          <p className="mt-1 text-xs text-slate-500">We review every report. Status updates appear here.</p>
          <div className="mt-4 space-y-2">
            {myRows.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing submitted yet.</p>
            ) : (
              myRows.slice(0, 8).map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900">{row.title}</p>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                      {row.type}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{row.description}</p>
                  <p className="mt-2 text-[10px] text-slate-400">
                    {formatWhen(row.createdAt)} · {row.status}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
