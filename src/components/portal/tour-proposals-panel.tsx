"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type ProposalPreview = {
  title: string;
  confirmLabel: string;
  fields: { label: string; value: string }[];
  warnings?: string[];
};

type Proposal = { id: string; preview: ProposalPreview; createdAt: string };

/**
 * Shows open tour proposals waiting for manager approval (approval-first auto-tour flow).
 * The opt-in toggle was removed — proposals only appear when PropLane has drafted one.
 */
export function TourProposalsPanel() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProposals = useCallback(async () => {
    try {
      const res = await fetch("/api/portal-tour-inquiries/proposals", { credentials: "include" });
      if (res.status === 401) return;
      const data = (await res.json().catch(() => ({}))) as { proposals?: Proposal[] };
      setProposals(Array.isArray(data.proposals) ? data.proposals : []);
    } catch {
      /* leave the list as-is on a transient failure */
    }
  }, []);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  const decide = useCallback(
    async (id: string, decision: "approve" | "discard") => {
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch("/api/portal-tour-inquiries/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ actionId: id, decision }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not update proposal.");
        setProposals((current) => current.filter((p) => p.id !== id));
        if (decision === "approve") {
          const { syncScheduleRecordsFromServer } = await import("@/lib/demo-admin-scheduling");
          await syncScheduleRecordsFromServer({ force: true });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update proposal.");
        await loadProposals();
      } finally {
        setBusyId(null);
      }
    },
    [loadProposals],
  );

  if (proposals.length === 0) return null;

  return (
    <section
      className="rounded-lg border border-border bg-card p-4 shadow-sm"
      aria-label="Tour proposals waiting for approval"
      data-attr="tour-proposals-panel"
    >
      <div className="mb-3">
        <p className="text-sm font-semibold text-foreground">Tour proposals</p>
        <p className="mt-0.5 text-xs text-muted">
          PropLane suggested these tour times. Approve to add them to your calendar or discard to dismiss.
        </p>
      </div>

      {error ? <p className="mb-3 text-xs text-danger">{error}</p> : null}

      <ul className="flex flex-col gap-3">
        {proposals.map((proposal) => (
          <li key={proposal.id} className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-sm font-semibold text-foreground">{proposal.preview.title}</p>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-2">
              {proposal.preview.fields.map((field, index) => (
                <div key={`${field.label}-${index}`} className="flex gap-1.5">
                  <dt className="shrink-0 font-medium text-foreground/80">{field.label}:</dt>
                  <dd className="min-w-0 break-words">{field.value}</dd>
                </div>
              ))}
            </dl>
            {proposal.preview.warnings?.length ? (
              <p className="mt-2 text-[11px] text-muted">{proposal.preview.warnings.join(" ")}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                className="px-4 text-[13px]"
                disabled={busyId === proposal.id}
                onClick={() => decide(proposal.id, "approve")}
                data-attr="tour-proposal-approve"
              >
                {proposal.preview.confirmLabel || "Confirm tour"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="px-4 text-[13px]"
                disabled={busyId === proposal.id}
                onClick={() => decide(proposal.id, "discard")}
                data-attr="tour-proposal-discard"
              >
                Discard
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
