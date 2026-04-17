"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PillTabs } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Input } from "@/components/ui/input";

export default function ApplyPage() {
  const { showToast } = useAppUi();
  const [step, setStep] = useState(1);
  const [group, setGroup] = useState<"yes" | "no">("no");

  const progress = useMemo(() => Math.round((step / 11) * 100), [step]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Rent with Axis</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Residential rental application</h1>
      <p className="mt-2 text-sm text-muted">
        Step {step} of 11 — Group application (demo). Progress and validation are intentionally lightweight.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <button
          type="button"
          className="text-xs font-semibold text-primary"
          onClick={() => showToast("Application type picker: coming soon")}
        >
          Change type
        </button>
      </div>

      <Card className="mt-8 p-6">
        <CardHeader title="Group application" subtitle="One person submits first; roommates join with the same Group ID." />
        <p className="mt-2 text-sm text-muted">
          Are you applying as part of a household group?
        </p>
        <div className="mt-4">
          <PillTabs
            items={[
              { id: "yes", label: "Yes" },
              { id: "no", label: "No" },
            ]}
            activeId={group}
            onChange={(id) => setGroup(id as "yes" | "no")}
          />
        </div>
        {group === "yes" ? (
          <div className="mt-6 space-y-3">
            <label className="text-xs font-semibold text-muted" htmlFor="gid">
              Group ID (optional for demo)
            </label>
            <Input id="gid" placeholder="GRP-XXXXXXXXXXXXXXXX" />
          </div>
        ) : null}
      </Card>

      <Button
        type="button"
        className="mt-6 w-full"
        onClick={() => {
          setStep((s) => Math.min(11, s + 1));
          showToast(`Advanced to step ${Math.min(11, step + 1)} (demo)`);
        }}
      >
        Continue
      </Button>
    </div>
  );
}
