"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_HEAD_ROW,
} from "@/components/portal/portal-data-table";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { readManagerApplicationRows, syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { getPropertyById, getRoomChoiceLabel } from "@/lib/rental-application/data";
import {
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsForUser,
  readPendingManagerPropertiesForUser,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import {
  appendLeaseThreadMessage,
  generateLeaseHtmlForRow,
  managerSignLease,
  LEASE_PIPELINE_EVENT,
  managerUploadLeasePdf,
  readLeasePipeline,
  syncLeasePipelineFromServer,
  updateLeasePipelineRow,
  downloadLeaseFromRow,
  printLeaseAsPdf,
  hasBothLeaseSignatures,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";

type ActiveResident = {
  id: string;
  name: string;
  email: string;
  propertyId: string;
  propertyLabel: string;
  roomLabel: string;
  signedMonthlyRent: number | null;
  axisId: string;
};

export function ManagerResidents() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [propertyTick, setPropertyTick] = useState(0);
  const [leaseTick, setLeaseTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [residentAccountEmails, setResidentAccountEmails] = useState<Set<string>>(new Set());
  const [uploadingLeaseRowId, setUploadingLeaseRowId] = useState<string | null>(null);
  const [generatingLeaseRowId, setGeneratingLeaseRowId] = useState<string | null>(null);

  useEffect(() => {
    const onLease = () => setLeaseTick((n) => n + 1);
    window.addEventListener(LEASE_PIPELINE_EVENT, onLease);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, onLease);
    };
  }, []);

  useEffect(() => {
    const bump = () => setPropertyTick((n) => n + 1);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  useEffect(() => {
    if (!authReady || !userId) return;
    let cancelled = false;
    void Promise.allSettled([
      syncPropertyPipelineFromServer(),
      syncManagerApplicationsFromServer(),
      syncLeasePipelineFromServer(userId),
    ]).then(() => {
      if (!cancelled) setPropertyTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, userId]);

  useEffect(() => {
    const emails = [
      ...new Set(
        readManagerApplicationRows()
          .filter(
            (row) =>
              row.bucket === "approved" &&
              row.email?.trim() &&
              applicationVisibleToPortalUser(row, userId),
          )
          .map((row) => row.email!.trim().toLowerCase()),
      ),
    ];
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (emails.length === 0) {
        setResidentAccountEmails(new Set());
        return;
      }
      return fetch("/api/manager/resident-account-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      })
        .then(async (res) => {
          const body = (await res.json()) as { emails?: string[] };
          if (!cancelled && res.ok) {
            setResidentAccountEmails(new Set((body.emails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean)));
          }
        })
        .catch(() => {
          if (!cancelled) setResidentAccountEmails(new Set());
        });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, propertyTick]);

  const residents = useMemo<ActiveResident[]>(() => {
    return readManagerApplicationRows()
      .filter(
        (row) =>
          row.bucket === "approved" &&
          row.email?.trim() &&
          residentAccountEmails.has(row.email.trim().toLowerCase()) &&
          applicationVisibleToPortalUser(row, userId),
      )
      .map((row) => {
        const propId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || "";
        const prop = propId ? getPropertyById(propId) : null;
        const roomLabel = getRoomChoiceLabel(
          row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "",
        ).split(" · ")[0]?.trim() || "";
        return {
          id: row.id,
          name: row.name,
          email: row.email!.trim(),
          propertyId: propId,
          propertyLabel: prop?.title?.trim() || row.property,
          roomLabel,
          signedMonthlyRent: row.signedMonthlyRent ?? null,
          axisId: `AXIS-R-${row.id.slice(0, 8).toUpperCase()}`,
        };
      });
  }, [userId, residentAccountEmails]);

  const propertyOptions = useMemo(() => {
    void propertyTick;
    const labelById = new Map<string, string>();
    if (userId) {
      for (const p of readExtraListingsForUser(userId)) {
        labelById.set(p.id, (p.title || p.buildingName || p.address || p.id).trim());
      }
      for (const p of readPendingManagerPropertiesForUser(userId)) {
        const label = [p.buildingName, p.address].filter(Boolean).join(" · ").trim() || p.id;
        labelById.set(p.id, label);
      }
    }
    for (const r of residents) {
      if (r.propertyId && !labelById.has(r.propertyId)) {
        labelById.set(r.propertyId, r.propertyLabel || r.propertyId);
      }
    }
    return [...labelById.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [residents, userId, propertyTick]);

  const filtered = useMemo(() => {
    const base = propertyFilter
      ? residents.filter((r) => r.propertyId === propertyFilter)
      : residents;
    return [...base].sort((a, b) => {
      const propCmp = a.propertyLabel.localeCompare(b.propertyLabel, undefined, { sensitivity: "base" });
      if (propCmp !== 0) return propCmp;
      const aNum = parseInt(a.roomLabel.match(/\d+/)?.[0] ?? "0", 10);
      const bNum = parseInt(b.roomLabel.match(/\d+/)?.[0] ?? "0", 10);
      return aNum - bNum;
    });
  }, [residents, propertyFilter]);

  const selected = useMemo(() => residents.find((r) => r.id === selectedId) ?? null, [residents, selectedId]);

  const residentLease = useMemo<LeasePipelineRow | null>(() => {
    void leaseTick;
    if (!selected?.email) return null;
    const email = selected.email.trim().toLowerCase();
    return readLeasePipeline(userId).find((row) => row.residentEmail.trim().toLowerCase() === email) ?? null;
  }, [leaseTick, selected, userId]);

  function generateLeaseDeferred(rowId: string) {
    if (generatingLeaseRowId) return;
    setGeneratingLeaseRowId(rowId);
    window.setTimeout(() => {
      try {
        const result = generateLeaseHtmlForRow(rowId);
        if (result.ok) {
          setLeaseTick((n) => n + 1);
          showToast(`Lease generated (v${result.version}).`);
        } else {
          showToast(result.error);
        }
      } finally {
        setGeneratingLeaseRowId(null);
      }
    }, 0);
  }

  function signLeaseAsManager(row: LeasePipelineRow) {
    const name = window.prompt("Type the manager / authorized agent name to sign this lease.");
    if (!name?.trim()) return;
    if (managerSignLease(row.id, name.trim())) {
      setLeaseTick((n) => n + 1);
      showToast(
        hasBothLeaseSignatures({
          ...row,
          managerSignature: { role: "manager", name: name.trim(), signedAtIso: new Date().toISOString() },
        })
          ? "Lease fully signed."
          : "Manager signature saved.",
      );
    } else {
      showToast("Could not sign lease.");
    }
  }

  return (
    <ManagerPortalPageShell
      title="Residents"
      titleAside={
        <PortalPropertyFilterPill
          propertyOptions={propertyOptions}
          propertyValue={propertyFilter}
          onPropertyChange={setPropertyFilter}
        />
      }
    >
      {filtered.length === 0 ? (
        <PortalDataTableEmpty
          message={
            residents.length === 0
              ? "No active residents yet. Residents appear here after approval and once they create an Axis resident account."
              : "No residents match the current filter."
          }
        />
      ) : (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="min-w-[680px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Name</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Email</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Room</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Monthly rent</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((res) => (
                  <Fragment key={res.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{res.name || "—"}</td>
                      <td className={PORTAL_TABLE_TD}>{res.email}</td>
                      <td className={PORTAL_TABLE_TD}>{res.propertyLabel || "—"}</td>
                      <td className={PORTAL_TABLE_TD}>{res.roomLabel || "—"}</td>
                      <td className={`${PORTAL_TABLE_TD} text-right tabular-nums`}>
                        {res.signedMonthlyRent ? `$${res.signedMonthlyRent.toFixed(2)}/mo` : "—"}
                      </td>
                      <td className={`${PORTAL_TABLE_TD} text-right`}>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full px-3 py-1 text-xs"
                          onClick={() => setSelectedId((cur) => (cur === res.id ? null : res.id))}
                        >
                          {selectedId === res.id ? "Close" : "Manage"}
                        </Button>
                      </td>
                    </tr>
                    {selectedId === res.id && selected ? (
                      <tr>
                        <td colSpan={6} className="bg-slate-50/60 px-4 py-5">
                          <div className="flex flex-col gap-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Account</p>
                              <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <span className="text-slate-500">Axis ID</span>
                                  <p className="font-mono font-medium text-slate-900">{selected.axisId}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Email</span>
                                  <p className="font-medium text-slate-900">{selected.email}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Property</span>
                                  <p className="font-medium text-slate-900">{selected.propertyLabel || "—"}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Room</span>
                                  <p className="font-medium text-slate-900">{selected.roomLabel || "—"}</p>
                                </div>
                                {selected.signedMonthlyRent ? (
                                  <div>
                                    <span className="text-slate-500">Monthly rent</span>
                                    <p className="font-semibold text-slate-900">${selected.signedMonthlyRent.toFixed(2)}/mo</p>
                                  </div>
                                ) : null}
                                <div>
                                  <span className="text-slate-500">Status</span>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                                      Active resident
                                    </span>
                                    {selected.signedMonthlyRent ? (
                                      <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200/80">
                                        Rent set
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200/80">
                                        No rent set
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Lease</p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {residentLease
                                      ? `${residentLease.stageLabel} · ${residentLease.application?.leaseStart || "No move-in"}${residentLease.application?.leaseEnd ? ` to ${residentLease.application.leaseEnd}` : ""}`
                                      : "No lease created yet for this resident."}
                                  </p>
                                </div>
                                {residentLease ? (
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      disabled={generatingLeaseRowId === residentLease.id}
                                      onClick={() => generateLeaseDeferred(residentLease.id)}
                                    >
                                      {generatingLeaseRowId === residentLease.id ? "Generating..." : "Generate lease"}
                                    </Button>
                                    {!residentLease.managerSignature ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        disabled={!residentLease.generatedHtml}
                                        onClick={() => signLeaseAsManager(residentLease)}
                                      >
                                        Sign as manager
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-full px-3 py-1 text-xs"
                                      onClick={() => {
                                        if (residentLease.managerUploadedPdf?.dataUrl) {
                                          downloadLeaseFromRow(residentLease);
                                        } else if (residentLease.generatedHtml) {
                                          printLeaseAsPdf(residentLease);
                                        } else {
                                          showToast("Generate or upload a lease first.");
                                          return;
                                        }
                                        showToast("Lease download started.");
                                      }}
                                    >
                                      Download lease
                                    </Button>
                                    {residentLease.bucket === "manager" ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        onClick={() => {
                                          if (!residentAccountEmails.has(selected.email.trim().toLowerCase())) {
                                            showToast("Resident must create their account before the lease can be sent.");
                                            return;
                                          }
                                          appendLeaseThreadMessage(residentLease.id, "manager", "Sent lease to resident for review.");
                                          updateLeasePipelineRow(residentLease.id, { bucket: "resident" });
                                          setLeaseTick((n) => n + 1);
                                          showToast("Lease moved to With resident.");
                                        }}
                                      >
                                        Send to resident
                                      </Button>
                                    ) : residentLease.bucket === "resident" ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full px-3 py-1 text-xs"
                                        onClick={() => {
                                          appendLeaseThreadMessage(residentLease.id, "manager", "Moved lease back to manager review.");
                                          updateLeasePipelineRow(residentLease.id, { bucket: "manager" });
                                          setLeaseTick((n) => n + 1);
                                          showToast("Lease moved to Manager review.");
                                        }}
                                      >
                                        Move to manager review
                                      </Button>
                                    ) : null}
                                    <label className="inline-flex cursor-pointer items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50">
                                      {uploadingLeaseRowId === residentLease.id ? "Uploading..." : "Upload PDF"}
                                      <input
                                        type="file"
                                        accept="application/pdf"
                                        className="sr-only"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file || !residentLease) return;
                                          setUploadingLeaseRowId(residentLease.id);
                                          const result = await managerUploadLeasePdf(residentLease.id, file);
                                          setUploadingLeaseRowId(null);
                                          e.currentTarget.value = "";
                                          if (result.ok) {
                                            setLeaseTick((n) => n + 1);
                                            showToast("Lease PDF uploaded.");
                                          } else {
                                            showToast(result.error ?? "Upload failed.");
                                          }
                                        }}
                                      />
                                    </label>
                                  </div>
                                ) : null}
                              </div>
                              {residentLease ? (
                                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                                  <div>
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
                                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Generated lease</p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        Original generated/uploaded lease before signatures are stamped.
                                      </p>
                                    </div>
                                    <LeaseDocumentPreview className="mt-3" row={residentLease} documentKind="generated" />
                                  </div>
                                  <div>
                                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3">
                                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Signed lease</p>
                                      <p className="mt-1 text-xs text-emerald-900/80">
                                        Shows manager and resident electronic signatures once collected.
                                      </p>
                                    </div>
                                    <LeaseDocumentPreview
                                      className="mt-3"
                                      row={residentLease}
                                      documentKind="signed"
                                      emptyHint="No signed copy yet. The signed lease appears here after manager and resident signatures are collected."
                                    />
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-3 text-sm text-slate-500">Approve the application and create or generate a lease here for this resident.</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </ManagerPortalPageShell>
  );
}
