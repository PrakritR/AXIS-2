"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateAxisGroupId, validateHouseholdCount } from "./apply-validation";

const SIGNER_STEPS = 11;

function ReqAsterisk() {
  return <span className="font-semibold text-primary"> *</span>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-[#0f172a]">{children}</p>;
}

const pillWrap = "flex flex-wrap gap-2 rounded-full border border-border bg-slate-50 p-1";
const pillActive = "rounded-full px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground shadow-sm transition-all";
const pillIdle = "rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-all hover:bg-white hover:text-foreground";

function stepLabel(step: number): string {
  if (step === 1) return "Group application";
  if (step === 2) return "Co-Signer";
  return "Application";
}

export function SignerApplyFlow({
  onBack,
  showToast,
}: {
  onBack: () => void;
  showToast: (msg: string) => void;
}) {
  const [step, setStep] = useState(1);

  /* Step 1 — group */
  const [householdGroup, setHouseholdGroup] = useState<"yes" | "no" | null>(null);
  const [firstApplicant, setFirstApplicant] = useState<"first" | "notFirst" | null>(null);
  const [householdCount, setHouseholdCount] = useState("");
  const [groupId, setGroupId] = useState("");
  const [groupIdError, setGroupIdError] = useState<string | null>(null);
  const [householdCountError, setHouseholdCountError] = useState<string | null>(null);

  /* Step 2 — co-signer */
  const [hasCosigner, setHasCosigner] = useState<"yes" | "no" | null>(null);

  const progress = useMemo(() => Math.round((step / SIGNER_STEPS) * 100), [step]);

  const validateStep1 = (): boolean => {
    setGroupIdError(null);
    setHouseholdCountError(null);

    if (householdGroup === null) {
      showToast("Please answer: Are you applying as part of a household group?");
      return false;
    }
    if (householdGroup === "no") return true;

    if (firstApplicant === null) {
      showToast("Please answer: Are you the first person in your group to submit?");
      return false;
    }
    if (firstApplicant === "first") {
      const c = validateHouseholdCount(householdCount);
      if (!c.ok) {
        setHouseholdCountError(c.message);
        showToast(c.message);
        return false;
      }
      return true;
    }
    const g = validateAxisGroupId(groupId);
    if (!g.ok) {
      setGroupIdError(g.message);
      showToast(g.message);
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    if (hasCosigner === null) {
      showToast("Please answer whether someone will be co-signing.");
      return false;
    }
    return true;
  };

  const handleContinue = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === SIGNER_STEPS) {
      showToast("Application submitted (demo).");
      return;
    }
    setStep((s) => s + 1);
    showToast(`Step ${step + 1} of ${SIGNER_STEPS} (demo)`);
  };

  const handleBack = () => {
    if (step <= 1) onBack();
    else setStep((s) => s - 1);
  };

  return (
    <>
      <p className="mt-6 text-center text-xs font-semibold uppercase tracking-wide text-muted sm:text-left">Rent with Axis</p>
      <p className="mt-1 text-center text-sm text-muted sm:text-left">
        Step {step} of {SIGNER_STEPS} — {stepLabel(step)}
      </p>

      <div className="mt-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <button type="button" className="text-xs font-semibold text-primary" onClick={() => showToast("Change type: coming soon")}>
          Change type
        </button>
      </div>

      {step === 1 ? (
        <Card className="mt-8 p-6 sm:p-8">
          <h2 className="text-lg font-bold tracking-tight text-[#0f172a]">Group application</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Applying with roommates? One person should submit first; everyone else joins with the same{" "}
            <span className="font-semibold text-[#0f172a]">Group ID</span> they receive.
          </p>

          <div className="mt-8">
            <FieldLabel>
              Are you applying as part of a household group?
              <ReqAsterisk />
            </FieldLabel>
            <div className={`mt-3 ${pillWrap}`}>
              <button
                type="button"
                onClick={() => setHouseholdGroup("yes")}
                className={householdGroup === "yes" ? pillActive : pillIdle}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => {
                  setHouseholdGroup("no");
                  setFirstApplicant(null);
                  setHouseholdCount("");
                  setGroupId("");
                  setGroupIdError(null);
                  setHouseholdCountError(null);
                }}
                className={householdGroup === "no" ? pillActive : pillIdle}
              >
                No
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Use <strong>No</strong> if you are applying alone.
            </p>
          </div>

          {householdGroup === "yes" ? (
            <div className="mt-8 space-y-8">
              <div>
                <FieldLabel>
                  Are you the first person in your group to submit this application?
                  <ReqAsterisk />
                </FieldLabel>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFirstApplicant("first");
                      setGroupId("");
                      setGroupIdError(null);
                    }}
                    className={`rounded-2xl border-2 px-4 py-4 text-left text-sm font-medium leading-snug transition-all ${
                      firstApplicant === "first"
                        ? "border-primary bg-[#eef2ff] text-[#0f172a] shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    Yes — I am first (I will get a Group ID to share)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFirstApplicant("notFirst");
                      setHouseholdCount("");
                      setHouseholdCountError(null);
                    }}
                    className={`rounded-2xl border-2 px-4 py-4 text-left text-sm font-medium leading-snug transition-all ${
                      firstApplicant === "notFirst"
                        ? "border-primary bg-[#eef2ff] text-[#0f172a] shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    No — someone already applied first (I have a Group ID)
                  </button>
                </div>
              </div>

              {firstApplicant === "first" ? (
                <div>
                  <FieldLabel>
                    How many people are in your group (including you)?
                    <ReqAsterisk />
                  </FieldLabel>
                  <p className="mt-1 text-xs text-slate-500">
                    Everyone who will live together should submit their own application using this Group ID.
                  </p>
                  <Input
                    inputMode="numeric"
                    value={householdCount}
                    onChange={(e) => {
                      setHouseholdCount(e.target.value);
                      setHouseholdCountError(null);
                    }}
                    placeholder="e.g. 3"
                    className={`mt-2 ${householdCountError ? "border-red-500 ring-2 ring-red-100" : ""}`}
                  />
                  {householdCountError ? (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
                      <span className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full bg-red-100 text-center text-[10px] font-bold leading-4 text-red-700">
                        !
                      </span>
                      {householdCountError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {firstApplicant === "notFirst" ? (
                <div>
                  <FieldLabel>
                    Group ID from the first applicant
                    <ReqAsterisk />
                  </FieldLabel>
                  <p className="mt-1 text-xs text-slate-500">
                    The first person to apply sees this after they submit — it starts with AXISGRP-.
                  </p>
                  <Input
                    value={groupId}
                    onChange={(e) => {
                      setGroupId(e.target.value);
                      setGroupIdError(null);
                    }}
                    placeholder="AXISGRP-..."
                    className={`mt-2 ${groupIdError ? "border-red-500 ring-2 ring-red-100" : ""}`}
                  />
                  {groupIdError ? (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
                      <span className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full bg-red-100 text-center text-[10px] font-bold leading-4 text-red-700">
                        !
                      </span>
                      {groupIdError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="mt-8 p-6 sm:p-8">
          <h2 className="text-lg font-bold tracking-tight text-[#0f172a]">Co-Signer</h2>
          <div className="mt-6">
            <FieldLabel>
              Will someone be co-signing this application with you?
              <ReqAsterisk />
            </FieldLabel>
            <div className={`mt-3 ${pillWrap}`}>
              <button type="button" onClick={() => setHasCosigner("yes")} className={hasCosigner === "yes" ? pillActive : pillIdle}>
                Yes
              </button>
              <button type="button" onClick={() => setHasCosigner("no")} className={hasCosigner === "no" ? pillActive : pillIdle}>
                No
              </button>
            </div>
          </div>
          <div className="mt-8 rounded-xl border border-[#c7d4fb] bg-[#eef2ff]/70 p-4 text-sm leading-relaxed text-slate-700">
            <p>
              After you submit, you&apos;ll receive an <strong className="text-[#0f172a]">Application ID</strong>. Share it with
              your co-signer — they&apos;ll need it to link their form to yours.
            </p>
            <p className="mt-3">
              If you are the <strong className="text-[#0f172a]">first roommate</strong> to apply, you will also get a{" "}
              <strong className="text-[#0f172a]">Group ID</strong> — share that with everyone else in your household so their
              applications stay linked.
            </p>
          </div>
        </Card>
      ) : null}

      {step >= 3 ? (
        <Card className="mt-8 p-6 sm:p-8">
          <h2 className="text-lg font-bold tracking-tight text-[#0f172a]">
            Step {step} — {stepLabel(step)}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Additional application sections will match your full mockups here. Continue advances the demo through step{" "}
            {SIGNER_STEPS}.
          </p>
        </Card>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" className="sm:w-auto" onClick={handleBack}>
          Back
        </Button>
        <Button type="button" className="sm:min-w-[200px]" onClick={handleContinue}>
          {step === SIGNER_STEPS ? "Submit application" : "Continue"}
        </Button>
      </div>
    </>
  );
}
