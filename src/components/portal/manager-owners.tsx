"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { demoOwnerAccounts } from "@/data/demo-portal";
import { ManagerSectionShell, PortalPropertyFilter } from "./manager-section-shell";

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

export function ManagerOwners() {
  const [alsoOwner, setAlsoOwner] = useState(false);
  const [ownerCount, setOwnerCount] = useState(1);
  const [slots, setSlots] = useState<OwnerSlot[]>([{ id: 1, label: "Owner 1", houseIds: [] }]);

  const count = useMemo(() => Math.min(8, Math.max(1, ownerCount)), [ownerCount]);

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

  return (
    <ManagerSectionShell
      title="Owners"
      filters={<PortalPropertyFilter />}
      actions={[
        { label: "Save", variant: "primary" },
        { label: "Refresh", variant: "outline" },
      ]}
    >
      <Card className="mb-4 border border-dashed border-slate-200/90 bg-slate-50/60 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Demo linked owners</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {demoOwnerAccounts.map((o) => (
            <span
              key={o.name}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200/90"
            >
              {o.name}
            </span>
          ))}
        </div>
      </Card>
      <Card className="p-5 sm:p-6">
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

      <Card className="p-5 sm:p-6">
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

      <div className="space-y-5">
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
            {idx < slots.length - 1 ? <p className="mt-4 text-xs text-slate-400">Houses can only map to one owner at a time in production; this demo allows overlap for layout testing.</p> : null}
          </Card>
        ))}
      </div>
    </ManagerSectionShell>
  );
}
