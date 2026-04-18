"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ApplyFieldRow } from "./apply-field-row";
import { CosignerApplyFlow } from "./cosigner-flow";
import { SignerApplyFlow } from "./signer-flow";

type ApplyPhase = "role" | "signer" | "cosigner";

export default function ApplyPage() {
  const { showToast } = useAppUi();
  const [phase, setPhase] = useState<ApplyPhase>("role");
  const [filingAs, setFilingAs] = useState<"signer" | "cosigner" | null>(null);

  const handleRoleContinue = () => {
    if (!filingAs) {
      showToast("Choose Signer or Co-Signer to continue.");
      return;
    }
    setPhase(filingAs);
    showToast(`Filing as ${filingAs === "signer" ? "Signer" : "Co-Signer"} (demo)`);
  };

  const backToRole = () => {
    setPhase("role");
    setFilingAs(null);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-[#0d1f4e] sm:text-4xl">
        Residential Rental Application
      </h1>

      {phase === "role" ? (
        <Card className="mt-10 p-8 sm:p-10">
          <h2 className="text-xl font-bold tracking-tight text-[#0d1f4e]">Who Are You Filing As?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Choose your role to begin the application.</p>

          <div className="mt-8 border-t border-slate-100 pt-6">
            <ApplyFieldRow
              label="Your role"
              hint="Select how you are filing this application."
              labelClassName="text-xs font-semibold text-slate-800"
            >
              <div className="flex flex-wrap gap-3">
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
            </ApplyFieldRow>
          </div>

          <Button type="button" className="mt-10 w-full" onClick={handleRoleContinue}>
            Continue
          </Button>
        </Card>
      ) : null}

      {phase === "cosigner" ? <CosignerApplyFlow onBack={backToRole} showToast={showToast} /> : null}
      {phase === "signer" ? <SignerApplyFlow onBack={backToRole} showToast={showToast} /> : null}
    </div>
  );
}
