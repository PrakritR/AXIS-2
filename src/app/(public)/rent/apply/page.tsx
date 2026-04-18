"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PillTabs } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Input } from "@/components/ui/input";

const TOTAL_STEPS = 11;

export default function ApplyPage() {
  const { showToast } = useAppUi();
  const [step, setStep] = useState(1);
  const [filingAs, setFilingAs] = useState<"signer" | "cosigner" | null>(null);
  const [group, setGroup] = useState<"yes" | "no">("no");

  const progress = useMemo(() => Math.round((step / TOTAL_STEPS) * 100), [step]);

  const handleContinue = () => {
    if (step === 1) {
      if (!filingAs) {
        showToast("Choose Signer or Co-Signer to continue.");
        return;
      }
      setStep(2);
      showToast(`Filing as ${filingAs === "signer" ? "Signer" : "Co-Signer"} (demo)`);
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
    showToast(`Advanced to step ${Math.min(TOTAL_STEPS, step + 1)} (demo)`);
  };

  const handleBack = () => {
    if (step <= 1) return;
    setStep((s) => s - 1);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-center text-3xl font-bold tracking-tight text-[#0d1f4e] sm:text-4xl">
        Residential Rental Application
      </h1>

      {step === 1 ? (
        <Card className="mx-auto mt-10 max-w-xl p-8 sm:p-10">
          <h2 className="text-xl font-bold tracking-tight text-[#0d1f4e]">Who Are You Filing As?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Choose your role to begin the application.</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => setFilingAs("signer")}
              className={`rounded-full border px-8 py-3.5 text-sm font-semibold transition-all duration-150 ${
                filingAs === "signer"
                  ? "border-[#3b66f5] bg-[#eef2ff] text-[#0f172a] ring-2 ring-[#3b66f5]/20"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
              }`}
            >
              Signer
            </button>
            <button
              type="button"
              onClick={() => setFilingAs("cosigner")}
              className={`rounded-full border px-8 py-3.5 text-sm font-semibold transition-all duration-150 ${
                filingAs === "cosigner"
                  ? "border-[#3b66f5] bg-[#eef2ff] text-[#0f172a] ring-2 ring-[#3b66f5]/20"
                  : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
              }`}
            >
              Co-Signer
            </button>
          </div>

          <Button type="button" className="mt-10 w-full" onClick={handleContinue}>
            Continue
          </Button>
        </Card>
      ) : (
        <>
          <p className="mt-6 text-center text-xs font-semibold uppercase tracking-wide text-muted sm:text-left">
            Rent with Axis
          </p>
          <p className="mt-1 text-center text-sm text-muted sm:text-left">
            Step {step} of {TOTAL_STEPS} — Group application (demo). Progress and validation are intentionally
            lightweight.
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
            <CardHeader
              title="Group application"
              subtitle="One person submits first; roommates join with the same Group ID."
            />
            <p className="mt-2 text-sm text-muted">Are you applying as part of a household group?</p>
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

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" className="sm:w-auto" onClick={handleBack}>
              Back
            </Button>
            <Button type="button" className="sm:min-w-[200px]" onClick={handleContinue}>
              Continue
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
