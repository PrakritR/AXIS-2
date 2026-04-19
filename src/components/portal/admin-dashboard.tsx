"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Card } from "@/components/ui/card";
import { PORTAL_KPI_LABEL, PORTAL_KPI_VALUE } from "@/components/portal/portal-metrics";
import { pendingInquiryCount, readPlannedEvents } from "@/lib/demo-admin-scheduling";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";

const launchPreviewClassName =
  "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_0_18px_rgba(0,122,255,0.28)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_0_22px_rgba(0,122,255,0.35)] active:translate-y-px";

type PortalUser = { id: string; label: string };

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block min-w-[10rem] rounded-xl border border-slate-200/80 bg-white px-5 py-4 transition hover:border-primary/35 hover:shadow-sm"
    >
      <p className={PORTAL_KPI_VALUE}>{value}</p>
      <p className={PORTAL_KPI_LABEL}>{label}</p>
    </Link>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [eventsTotal, setEventsTotal] = useState("0");
  const [managers, setManagers] = useState<PortalUser[]>([]);
  const [residents, setResidents] = useState<PortalUser[]>([]);
  const [owners, setOwners] = useState<PortalUser[]>([]);
  const [counts, setCounts] = useState({ managers: 0, residents: 0, owners: 0 });
  const [managerId, setManagerId] = useState("");
  const [residentId, setResidentId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [launchingPortal, setLaunchingPortal] = useState<"manager" | "resident" | "owner" | null>(null);

  const goPreview = useCallback(
    async (portal: "manager" | "resident" | "owner", id: string) => {
      if (!id || launchingPortal) return;
      setLaunchingPortal(portal);
      try {
        const res = await fetch("/api/admin/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: id, portal }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          showToast(body.error ?? "Could not start preview.");
          return;
        }
        const path =
          portal === "manager" ? "/manager/dashboard" : portal === "resident" ? "/resident/dashboard" : "/owner/dashboard";
        router.push(path);
        router.refresh();
      } catch {
        showToast("Network error.");
      } finally {
        setLaunchingPortal(null);
      }
    },
    [launchingPortal, router, showToast],
  );

  const loadPortalUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/portal-users");
      const body = (await res.json()) as {
        managers?: PortalUser[];
        residents?: PortalUser[];
        owners?: PortalUser[];
        counts?: { managers: number; residents: number; owners: number };
        error?: string;
      };
      if (!res.ok) return;
      setManagers(body.managers ?? []);
      setResidents(body.residents ?? []);
      setOwners(body.owners ?? []);
      if (body.counts) setCounts(body.counts);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadPortalUsers();
  }, [loadPortalUsers]);

  useEffect(() => {
    const syncEvents = () => {
      const n = readPlannedEvents().length + pendingInquiryCount();
      setEventsTotal(String(n));
    };
    syncEvents();
    const on = () => syncEvents();
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/90 bg-white p-6 shadow-sm">
        <div className="grid gap-8 lg:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Manager portal</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                aria-label="Manager preview"
                className="min-w-[12rem] flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
              >
                <option value="">— choose manager —</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!managerId || launchingPortal !== null}
                onClick={() => void goPreview("manager", managerId)}
                className={`${launchPreviewClassName} ${!managerId ? "pointer-events-none opacity-50" : ""} disabled:opacity-60`}
                style={{
                  background: "linear-gradient(135deg, var(--primary), var(--primary-alt))",
                }}
              >
                {launchingPortal === "manager" ? "Opening…" : "Launch preview"}
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Resident portal</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                aria-label="Resident preview"
                className="min-w-[12rem] flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={residentId}
                onChange={(e) => setResidentId(e.target.value)}
              >
                <option value="">— choose resident —</option>
                {residents.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!residentId || launchingPortal !== null}
                onClick={() => void goPreview("resident", residentId)}
                className={`${launchPreviewClassName} ${!residentId ? "pointer-events-none opacity-50" : ""} disabled:opacity-60`}
                style={{
                  background: "linear-gradient(135deg, var(--primary), var(--primary-alt))",
                }}
              >
                {launchingPortal === "resident" ? "Opening…" : "Launch preview"}
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner portal</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                aria-label="Owner preview"
                className="min-w-[12rem] flex-1 rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                <option value="">— choose owner —</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!ownerId || launchingPortal !== null}
                onClick={() => void goPreview("owner", ownerId)}
                className={`${launchPreviewClassName} ${!ownerId ? "pointer-events-none opacity-50" : ""} disabled:opacity-60`}
                style={{
                  background: "linear-gradient(135deg, var(--primary), var(--primary-alt))",
                }}
              >
                {launchingPortal === "owner" ? "Opening…" : "Launch preview"}
              </button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Properties" value="0" href="/admin/properties" />
        <StatCard label="Managers" value={String(counts.managers)} href="/admin/managers" />
        <StatCard label="Owners" value={String(counts.owners)} href="/admin/owners" />
        <StatCard label="Events" value={eventsTotal} href="/admin/events/events" />
      </div>
    </div>
  );
}
