"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApplicationById, getHouseForApplication } from "@/lib/demo-application-house";
import { downloadLeaseHtmlFile, fetchLeaseTemplate, fillLeaseTemplate, openPrintableLease } from "@/lib/demo-lease-doc";
import {
  appendLeaseThreadMessage,
  editLeaseThreadMessage,
  listLeaseThreadMessagesForViewer,
  readLeaseThreadMessages,
  type LeaseThreadAuthor,
  type LeaseThreadMessage,
} from "@/lib/demo-lease-threads";
import { listChargesForApplication, listChargesForResidentEmail, managerAddPaymentCharge } from "@/lib/demo-manager-payments";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";

export type LeasePortalMode = "admin" | "manager" | "owner" | "resident";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

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

function authorBadge(role: LeaseThreadAuthor) {
  const map: Record<LeaseThreadAuthor, string> = {
    admin: "bg-slate-200 text-slate-800 ring-slate-300",
    manager: "bg-violet-100 text-violet-900 ring-violet-200",
    owner: "bg-amber-100 text-amber-950 ring-amber-200",
    resident: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${map[role]}`}>
      {role}
    </span>
  );
}

function defaultLabel(mode: LeasePortalMode): string {
  switch (mode) {
    case "admin":
      return "Axis Admin";
    case "manager":
      return "Property Manager";
    case "owner":
      return "Owner";
    case "resident":
      return "Resident";
    default:
      return "User";
  }
}

export function PortalLeaseWorkflowClient({ mode, applicationId = "app-demo-1" }: { mode: LeasePortalMode; applicationId?: string }) {
  const [tick, setTick] = useState(0);
  const [template, setTemplate] = useState<string | null>(null);
  const [threadBody, setThreadBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [payTitle, setPayTitle] = useState("");
  const [payDollars, setPayDollars] = useState("");
  const [payNote, setPayNote] = useState("");

  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const on = () => bump();
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [bump]);

  useEffect(() => {
    void fetchLeaseTemplate().then(setTemplate);
  }, []);

  const app = useMemo(() => getApplicationById(applicationId), [applicationId, tick]);
  const house = useMemo(() => (app ? getHouseForApplication(app.id) : null), [app, tick]);

  const threadAuthor: LeaseThreadAuthor = mode;

  const threadMessages: LeaseThreadMessage[] = useMemo(() => {
    if (!app) return [];
    if (mode === "admin") return readLeaseThreadMessages(app.id);
    return listLeaseThreadMessagesForViewer(app.id, threadAuthor);
  }, [app, mode, threadAuthor, tick]);

  const chargesApp = useMemo(() => (app ? listChargesForApplication(app.id) : []), [app, tick]);
  const chargesResident = useMemo(() => (app ? listChargesForResidentEmail(app.email) : []), [app, tick]);

  const filledLease = useMemo(() => {
    if (!app || !template) return null;
    return fillLeaseTemplate(template, app, house);
  }, [app, house, template]);

  const openLease = () => {
    if (!filledLease) return;
    openPrintableLease(filledLease);
  };

  const saveLeaseFile = () => {
    if (!filledLease || !app) return;
    downloadLeaseHtmlFile(`lease-${app.id}.html`, filledLease);
  };

  const postThread = () => {
    if (!app) return;
    const t = threadBody.trim();
    if (!t) return;
    appendLeaseThreadMessage(app.id, threadAuthor, defaultLabel(mode), t);
    setThreadBody("");
    bump();
  };

  const startEdit = (m: LeaseThreadMessage) => {
    if (m.authorRole !== mode) return;
    setEditingId(m.id);
    setEditDraft(m.body);
  };

  const saveEdit = (messageId: string) => {
    const ok = editLeaseThreadMessage(messageId, mode, defaultLabel(mode), editDraft);
    if (ok) {
      setEditingId(null);
      setEditDraft("");
      bump();
    }
  };

  const addPayment = () => {
    if (!app || mode !== "manager") return;
    const title = payTitle.trim();
    const dollars = Number.parseFloat(payDollars);
    if (!title || !Number.isFinite(dollars) || dollars <= 0) return;
    const cents = Math.round(dollars * 100);
    managerAddPaymentCharge({
      applicationId: app.id,
      residentEmail: app.email,
      title,
      amountCents: cents,
      note: payNote,
    });
    setPayTitle("");
    setPayDollars("");
    setPayNote("");
    bump();
  };

  if (!app) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Application not found.</div>;
  }

  const showAdminThreadNote = mode === "resident";

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6">
        <h2 className="text-xl font-bold text-slate-900">Application &amp; unit</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-400">Tenant</dt>
            <dd className="font-medium text-slate-900">{app.fullLegalName}</dd>
            <dd className="text-slate-600">{app.email}</dd>
            <dd className="text-slate-600">{app.phone}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-400">Employment</dt>
            <dd className="text-slate-800">{app.employer}</dd>
            <dd className="text-slate-600">{app.monthlyIncomeLabel}</dd>
          </div>
          {house ? (
            <>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">Address</dt>
                <dd className="text-slate-800">
                  {house.street}
                  {house.unit ? `, Unit ${house.unit}` : ""}
                </dd>
                <dd className="text-slate-600">
                  {house.city}, {house.state} {house.zip}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">Rent &amp; term</dt>
                <dd className="text-slate-800">
                  {formatMoney(house.monthlyRentCents)} / mo · deposit {formatMoney(house.securityDepositCents)}
                </dd>
                <dd className="text-slate-600">
                  {house.leaseStart} → {house.leaseEnd}
                </dd>
              </div>
            </>
          ) : (
            <p className="text-sm text-amber-800 sm:col-span-2">No linked unit record — lease tokens for address/rent will show “—”.</p>
          )}
        </dl>
      </div>

      <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6">
        <h2 className="text-xl font-bold text-slate-900">Lease document</h2>
        <p className="mt-1 text-sm text-slate-500">
          Filled from this application and linked house using <code className="rounded bg-slate-100 px-1">/assets/lease-example.html</code>. Use Print → Save as PDF.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!filledLease}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #007aff, #339cff)" }}
            onClick={openLease}
          >
            Preview &amp; print / PDF
          </button>
          <button
            type="button"
            disabled={!filledLease}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            onClick={saveLeaseFile}
          >
            Download HTML
          </button>
        </div>
      </div>

      {(mode === "manager" || mode === "admin" || mode === "owner") && (
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6">
          <h2 className="text-xl font-bold text-slate-900">Fees &amp; charges</h2>
          {mode === "manager" ? (
            <p className="mt-1 text-sm text-slate-500">Adds a line item for this applicant; it appears on the resident portal for the same email.</p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Charges created by the manager for this application.</p>
          )}

          {mode === "manager" ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4">
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">Title</label>
                <input
                  value={payTitle}
                  onChange={(e) => setPayTitle(e.target.value)}
                  className="mt-1 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="e.g. Application fee, parking permit"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">Amount (USD)</label>
                <input
                  value={payDollars}
                  onChange={(e) => setPayDollars(e.target.value)}
                  className="mt-1 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="150.00"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">Note (optional)</label>
                <input
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="mt-1 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={addPayment}
                className="inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Add payment
              </button>
            </div>
          ) : null}

          <ul className="mt-4 space-y-2">
            {chargesApp.length === 0 ? (
              <li className="text-sm text-slate-500">No charges yet.</li>
            ) : (
              chargesApp.map((c) => (
                <li key={c.id} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-900">{c.title}</span>
                    <span className="font-bold text-slate-800">{formatMoney(c.amountCents)}</span>
                  </div>
                  {c.note ? <p className="mt-1 text-slate-600">{c.note}</p> : null}
                  <p className="mt-1 text-xs text-slate-400">{formatWhen(c.createdAt)}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {mode === "resident" ? (
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6">
          <h2 className="text-xl font-bold text-slate-900">Your balance</h2>
          <p className="mt-1 text-sm text-slate-500">Posted by your property manager for your account email.</p>
          <ul className="mt-4 space-y-2">
            {chargesResident.length === 0 ? (
              <li className="text-sm text-slate-500">No open charges.</li>
            ) : (
              chargesResident.map((c) => (
                <li key={c.id} className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-900">{c.title}</span>
                    <span className="font-bold text-slate-800">{formatMoney(c.amountCents)}</span>
                  </div>
                  {c.note ? <p className="mt-1 text-slate-600">{c.note}</p> : null}
                  <p className="mt-1 text-xs text-slate-400">{formatWhen(c.createdAt)}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_50px_-36px_rgba(15,23,42,0.16)] sm:p-6">
        <h2 className="text-xl font-bold text-slate-900">Lease thread</h2>
        {showAdminThreadNote ? (
          <p className="mt-1 text-sm text-amber-800">
            Notes from Axis Admin are hidden here. Your manager, owner, and other residents on this thread can still coordinate with you.
          </p>
        ) : mode === "admin" ? (
          <p className="mt-1 text-sm text-slate-500">You see the full conversation, including internal admin notes and manager/owner/resident messages.</p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Managers and owners can read admin messages; residents cannot.</p>
        )}

        <ul className="mt-4 space-y-3">
          {threadMessages.map((m) => (
            <li key={m.id} className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {authorBadge(m.authorRole)}
                <span className="text-xs font-semibold text-slate-600">{m.authorLabel}</span>
                <span className="text-xs text-slate-400">{formatWhen(m.createdAt)}</span>
                {m.editedAt ? <span className="text-[10px] font-semibold uppercase text-slate-400">Edited</span> : null}
              </div>
              {editingId === m.id ? (
                <div className="mt-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    className="w-full max-w-xl rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded-full px-3 py-1.5 text-sm font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #007aff, #339cff)" }}
                      onClick={() => saveEdit(m.id)}
                    >
                      Save edit
                    </button>
                    <button type="button" className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{m.body}</p>
                  {m.authorRole === mode ? (
                    <button type="button" className="mt-2 text-xs font-semibold text-[#007aff] hover:underline" onClick={() => startEdit(m)}>
                      Edit my message
                    </button>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <label className="text-xs font-semibold uppercase text-slate-500" htmlFor="thread-compose">
            New message as {mode}
          </label>
          <textarea
            id="thread-compose"
            rows={3}
            value={threadBody}
            onChange={(e) => setThreadBody(e.target.value)}
            className="mt-2 w-full max-w-xl rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="Write an update…"
          />
          <button
            type="button"
            onClick={postThread}
            className="mt-2 inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
