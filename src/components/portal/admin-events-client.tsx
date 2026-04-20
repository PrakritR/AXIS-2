"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalCalendarPanels } from "@/components/portal/portal-calendar-panels";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  acceptPartnerInquiry,
  declinePartnerInquiry,
  deletePlannedEvent,
  formatRangeLabel,
  ADMIN_AVAILABILITY_STORAGE_KEY,
  readPartnerInquiries,
  readPlannedEvents,
  type PartnerInquiry,
} from "@/lib/demo-admin-scheduling";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";

function PartnerInquiryDetailPanel({
  row,
  instructionsDraft,
  onInstructionsChange,
  onClose,
  onChanged,
  showToast,
}: {
  row: PartnerInquiry;
  instructionsDraft: string;
  onInstructionsChange: (v: string) => void;
  onClose: () => void;
  onChanged: () => void;
  showToast: (m: string) => void;
}) {
  const onAccept = () => {
    if (acceptPartnerInquiry(row.id, { instructions: instructionsDraft })) {
      showToast("Scheduled — partner emailed (demo: sessionStorage axis_demo_outbound_mail_v1).");
      onChanged();
      onClose();
    } else showToast("Could not accept this request.");
  };

  const onDecline = () => {
    if (declinePartnerInquiry(row.id)) {
      showToast("Request declined.");
      onChanged();
      onClose();
    } else showToast("Could not update this request.");
  };

  return (
    <div className="border-t border-slate-200/90 bg-slate-50/50 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Partner</p>
          <p className="mt-0.5 text-base font-semibold text-slate-900">{row.name}</p>
          <p className="text-sm text-slate-600">{row.email}</p>
        </div>
        <Button type="button" variant="ghost" className="shrink-0 rounded-full px-3 py-1.5 text-xs text-slate-600" onClick={onClose}>
          Close
        </Button>
      </div>
      <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Time</dt>
          <dd className="mt-0.5 font-medium text-slate-900">{formatRangeLabel(row.proposedStart, row.proposedEnd)}</dd>
        </div>
        {row.phone ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Phone</dt>
            <dd className="mt-0.5">{row.phone}</dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Their notes</dt>
          <dd className="mt-0.5 whitespace-pre-wrap">{row.notes?.trim() ? row.notes : "—"}</dd>
        </div>
      </dl>
      {row.status === "pending" ? (
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="inquiry-host-msg">
            Message for partner (optional)
          </label>
          <Textarea
            id="inquiry-host-msg"
            rows={3}
            value={instructionsDraft}
            onChange={(e) => onInstructionsChange(e.target.value)}
            placeholder="Zoom link, dial-in, parking, agenda…"
            className="min-h-[5rem] rounded-xl border-slate-200 bg-white text-sm"
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="rounded-full !border-0 !bg-emerald-600 !text-white hover:!bg-emerald-700"
              onClick={onAccept}
            >
              Accept & schedule
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-300 bg-white text-rose-800 hover:bg-rose-50"
              onClick={onDecline}
            >
              REJECT
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs font-medium capitalize text-slate-500">Status: {row.status}</p>
      )}
    </div>
  );
}

/** Admin calendar: same schedule + availability UI as the manager portal, plus planned events and partner inquiries on one page. */
export function AdminEventsClient() {
  const { showToast } = useAppUi();
  const [tick, setTick] = useState(0);
  const [calendarRefreshSignal, setCalendarRefreshSignal] = useState(0);
  const [detail, setDetail] = useState<PartnerInquiry | null>(null);
  const [inquiryInstructionsDraft, setInquiryInstructionsDraft] = useState("");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    setInquiryInstructionsDraft("");
  }, [detail?.id]);

  useEffect(() => {
    const on = () => bump();
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [bump]);

  const { planned, pendingRows } = useMemo(() => {
    const inq = readPartnerInquiries();
    return {
      planned: readPlannedEvents(),
      pendingRows: inq.filter((r) => r.status === "pending"),
    };
  }, [tick]);

  const refresh = () => {
    bump();
    setCalendarRefreshSignal((n) => n + 1);
    showToast("Refreshed.");
  };

  return (
    <ManagerPortalPageShell
      title="Calendar"
      titleAside={
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refresh}>
          Refresh
        </Button>
      }
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:gap-5">
        <div className="flex min-w-0 flex-col gap-4 xl:w-[min(420px,40%)] xl:shrink-0">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200/80 bg-white px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Planned events</p>
            </div>
            <div className="max-h-[min(220px,32vh)] min-h-0 overflow-y-auto overscroll-contain bg-white px-1 py-2 sm:px-2">
              {planned.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-500">No meetings yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {planned.map((e) => (
                    <Fragment key={e.id}>
                      <li className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 sm:px-3">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-slate-900">{e.title}</span>
                          <span className="text-slate-500"> · {formatRangeLabel(e.start, e.end)}</span>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-slate-200 px-2.5 py-1 text-xs"
                            onClick={() => setExpandedEventId((id) => (id === e.id ? null : e.id))}
                          >
                            {expandedEventId === e.id ? "Hide" : "Details"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full !border-0 !bg-rose-600 px-2.5 py-1 text-xs !text-white hover:!bg-rose-700"
                            onClick={() => {
                              if (deletePlannedEvent(e.id)) {
                                showToast("Event removed.");
                                setExpandedEventId((id) => (id === e.id ? null : id));
                                bump();
                              } else showToast("Could not delete.");
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </li>
                      {expandedEventId === e.id ? (
                        <li className="bg-slate-50/80 px-2 py-2 text-xs text-slate-600 sm:px-3">
                          <p>
                            <span className="font-semibold text-slate-500">When: </span>
                            {formatRangeLabel(e.start, e.end)}
                          </p>
                          {e.instructions ? (
                            <p className="mt-2 whitespace-pre-wrap">
                              <span className="font-semibold text-slate-500">Host message: </span>
                              {e.instructions}
                            </p>
                          ) : (
                            <p className="mt-2 text-slate-400">No host message stored.</p>
                          )}
                          {e.sourceInquiryId ? (
                            <p className="mt-2 font-mono text-[10px] text-slate-400">Inquiry ref: {e.sourceInquiryId}</p>
                          ) : null}
                        </li>
                      ) : null}
                    </Fragment>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="flex min-h-[12rem] min-w-0 flex-1 flex-col overflow-hidden p-0">
            <div className="border-b border-slate-200/80 bg-white px-5 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Partner inquiries</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white">
              {pendingRows.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500">No pending requests.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="sticky top-0 z-[1] border-b border-slate-200/90 bg-white">
                          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:px-4 sm:text-xs">
                            Partner
                          </th>
                          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:px-4 sm:text-xs">
                            Email
                          </th>
                          <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:px-4 sm:text-xs">
                            Window
                          </th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:px-4 sm:text-xs">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingRows.map((row) => (
                          <tr
                            key={row.id}
                            className={`border-b border-slate-100 last:border-0 ${detail?.id === row.id ? "bg-primary/[0.04]" : ""}`}
                          >
                            <td className="px-3 py-2.5 font-semibold text-slate-900 sm:px-4">{row.name}</td>
                            <td className="max-w-[8rem] truncate px-3 py-2.5 text-slate-600 sm:px-4">{row.email}</td>
                            <td className="px-3 py-2.5 text-slate-600 sm:px-4">{formatRangeLabel(row.proposedStart, row.proposedEnd)}</td>
                            <td className="px-3 py-2.5 text-right sm:px-4">
                              <Button
                                type="button"
                                variant="outline"
                                className={`rounded-full border-slate-200 px-3 py-1.5 text-xs font-medium ${
                                  detail?.id === row.id ? "border-primary/40 bg-primary/10 text-primary" : "text-slate-800"
                                }`}
                                onClick={() => setDetail((cur) => (cur?.id === row.id ? null : row))}
                              >
                                {detail?.id === row.id ? "Hide" : "Details"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {detail ? (
                    <PartnerInquiryDetailPanel
                      row={detail}
                      instructionsDraft={inquiryInstructionsDraft}
                      onInstructionsChange={setInquiryInstructionsDraft}
                      onClose={() => setDetail(null)}
                      onChanged={bump}
                      showToast={showToast}
                    />
                  ) : null}
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="min-w-0 flex-1">
          <PortalCalendarPanels
            storageKey={ADMIN_AVAILABILITY_STORAGE_KEY}
            calendarRefreshSignal={calendarRefreshSignal}
          />
        </div>
      </div>
    </ManagerPortalPageShell>
  );
}
