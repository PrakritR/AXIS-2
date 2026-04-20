"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { demoOwnerAccounts } from "@/data/demo-portal";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  PORTAL_SECTION_SURFACE,
} from "./portal-metrics";

const MOCK_HOUSES = [
  { id: "pioneer", label: "Pioneer Heights · 1201 E Union" },
  { id: "marina", label: "Marina Commons · 4523 Aurora Ave N" },
  { id: "summit", label: "Summit House · 908 NW 58th" },
  { id: "junction", label: "Junction Flats · 4414 California Ave SW" },
];

type OwnerSlot = {
  id: number;
  label: string;
  houseIds: string[];
};

function OwnerAccountStatusPill({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
      Disabled
    </span>
  );
}

export function ManagerOwners() {
  const { showToast } = useAppUi();
  const [alsoOwner, setAlsoOwner] = useState(false);
  const [ownerCount, setOwnerCount] = useState(1);
  const [slots, setSlots] = useState<OwnerSlot[]>([{ id: 1, label: "Owner 1", houseIds: [] }]);
  const [subLoaded, setSubLoaded] = useState(false);
  const [canAddOwners, setCanAddOwners] = useState(true);
  const [ownerDirTab, setOwnerDirTab] = useState<"active" | "disabled">("active");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/manager/subscription", { credentials: "include" });
        const body = (await res.json()) as {
          isBusiness?: boolean;
          isLegacyUnlimited?: boolean;
        };
        if (res.ok) {
          const legacy = body.isLegacyUnlimited === true;
          const business = body.isBusiness === true;
          setCanAddOwners(legacy || business);
        }
      } catch {
        /* fail open */
      } finally {
        setSubLoaded(true);
      }
    })();
  }, []);

  const count = useMemo(() => Math.min(8, Math.max(1, ownerCount)), [ownerCount]);

  const activeCount = useMemo(() => demoOwnerAccounts.filter((o) => o.active).length, []);
  const disabledCount = useMemo(() => demoOwnerAccounts.filter((o) => !o.active).length, []);
  const visibleOwners = useMemo(
    () => demoOwnerAccounts.filter((o) => (ownerDirTab === "active" ? o.active : !o.active)),
    [ownerDirTab],
  );

  const ownerTabs = useMemo(
    () => [
      { id: "active" as const, label: "Active", count: activeCount },
      { id: "disabled" as const, label: "Disabled", count: disabledCount },
    ],
    [activeCount, disabledCount],
  );

  const syncSlots = (n: number) => {
    setSlots((prev) => {
      const next: OwnerSlot[] = [];
      for (let i = 1; i <= n; i++) {
        const existing = prev.find((s) => s.id === i);
        next.push(existing ?? { id: i, label: `Owner ${i}`, houseIds: [] });
      }
      return next;
    });
  };

  if (!subLoaded) {
    return (
      <ManagerPortalPageShell title="Owners" titleAside={<Button variant="outline" className="rounded-full" disabled>Refresh</Button>}>
        <p className="text-sm text-slate-500">Loading…</p>
      </ManagerPortalPageShell>
    );
  }

  if (!canAddOwners) {
    return (
      <ManagerPortalPageShell
        title="Owners"
        titleAside={
          <Button type="button" variant="outline" className="rounded-full" onClick={() => showToast("Refreshed (demo).")}>
            Refresh
          </Button>
        }
      >
        <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Business tier required</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
            Linking owner accounts is not available on Free or Pro. Upgrade to Business to invite co-owners and assign
            properties.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/manager/upgrade"
              className="inline-flex items-center justify-center rounded-full bg-[#1d1d1f] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
            >
              View upgrade options
            </Link>
            <Link
              href="/partner/pricing"
              className="inline-flex items-center justify-center rounded-full border border-black/[0.1] bg-white px-5 py-2.5 text-sm font-semibold text-[#1d1d1f] shadow-sm transition hover:bg-slate-50"
            >
              Pricing
            </Link>
          </div>
        </div>
      </ManagerPortalPageShell>
    );
  }

  return (
    <>
      <ManagerPortalPageShell
        title="Owners"
        titleAside={
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={() => showToast("Refreshed (demo).")}>
            Refresh
          </Button>
        }
        filterRow={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ManagerPortalStatusPills
              tabs={[...ownerTabs]}
              activeId={ownerDirTab}
              onChange={(id) => setOwnerDirTab(id as "active" | "disabled")}
            />
          </div>
        }
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
          {visibleOwners.length === 0 ? (
            <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
              <p className="text-sm font-medium text-slate-500">
                {demoOwnerAccounts.length === 0
                  ? "No owner accounts linked yet (demo)."
                  : "No owners in this status (demo)."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200/90 bg-white">
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Owner</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Email</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Properties</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOwners.map((o) => (
                    <tr key={o.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-4 align-middle font-semibold text-slate-900">{o.name}</td>
                      <td className="px-5 py-4 align-middle text-sm text-slate-600">{o.email}</td>
                      <td className="px-5 py-4 align-middle text-sm text-slate-700">{o.properties}</td>
                      <td className="px-5 py-4 align-middle">
                        <OwnerAccountStatusPill active={o.active} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ManagerPortalPageShell>

      <div className={`${PORTAL_SECTION_SURFACE} mt-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Invite owners</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="rounded-full" onClick={() => showToast("Saved (demo).")}>
              Save
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => showToast("Refreshed (demo).")}>
              Refresh
            </Button>
          </div>
        </div>

        <Card className="mt-6 border border-dashed border-slate-200/90 bg-slate-50/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Quick reference</p>
          <p className="mt-2 text-sm text-slate-600">
            Use the steps below to generate invite links. Linked owners appear in the directory above when data is wired to
            your account.
          </p>
        </Card>

        <Card className="mt-4 p-5 sm:p-6">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-primary"
              checked={alsoOwner}
              onChange={(e) => setAlsoOwner(e.target.checked)}
            />
            <span>
              <span className="text-sm font-semibold text-slate-900">I am both owner and manager</span>
              <span className="mt-1 block text-sm text-slate-600">
                Check this if you personally own units you also operate. You can still invite co-owners for other houses.
              </span>
            </span>
          </label>
        </Card>

        <Card className="mt-4 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">How many owner accounts?</p>
          <p className="mt-2 text-sm text-slate-600">
            Each owner gets their own login and sees only the properties you assign. One owner may have multiple managers
            across buildings; managers can cover multiple properties.
          </p>
          <div className="mt-4 max-w-xs">
            <Select
              value={String(count)}
              onChange={(e) => {
                const n = Number(e.target.value);
                setOwnerCount(n);
                syncSlots(n);
              }}
            >
              {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} owner{n > 1 ? "s" : ""}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        <div className="mt-5 space-y-5">
          {slots.map((slot, idx) => (
            <Card key={slot.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary/80">Owner slot {slot.id}</p>
                  <Input
                    className="mt-2 max-w-md"
                    value={slot.label}
                    onChange={(e) =>
                      setSlots((s) => s.map((x) => (x.id === slot.id ? { ...x, label: e.target.value } : x)))
                    }
                    placeholder="Display name (optional)"
                  />
                </div>
                <Link
                  href={`/auth/create-owner?slot=${slot.id}`}
                  className="inline-flex shrink-0 items-center justify-center rounded-full border border-black/[0.1] bg-white/80 px-5 py-2.5 text-[14px] font-semibold text-[#1d1d1f] shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-px"
                >
                  Owner account link
                </Link>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Only this invite link can create an owner account for slot {slot.id}. After signup they sign in at{" "}
                <span className="font-semibold text-slate-700">Manager / Owner login</span> and land in the owner portal.
              </p>

              <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Linked houses</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {MOCK_HOUSES.map((h) => {
                  const checked = slot.houseIds.includes(h.id);
                  return (
                    <label
                      key={h.id}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-primary"
                        checked={checked}
                        onChange={() =>
                          setSlots((s) =>
                            s.map((x) => {
                              if (x.id !== slot.id) return x;
                              const set = new Set(x.houseIds);
                              if (set.has(h.id)) set.delete(h.id);
                              else set.add(h.id);
                              return { ...x, houseIds: [...set] };
                            }),
                          )
                        }
                      />
                      {h.label}
                    </label>
                  );
                })}
              </div>
              {idx < slots.length - 1 ? (
                <p className="mt-4 text-xs text-slate-400">
                  Houses can only map to one owner at a time in production; this demo allows overlap for layout testing.
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
