"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { syncScheduleRecordsFromServer } from "@/lib/demo-admin-scheduling";

type ProposalPreview = {
  title: string;
  confirmLabel: string;
  fields: { label: string; value: string }[];
  warnings?: string[];
};

type Proposal = { id: string; preview: ProposalPreview; createdAt: string };

/**
 * Standalone approval surface for approval-first automated tours. It renders the
 * per-manager opt-in toggle plus any open tour proposals PropLane generated, and
 * approves/discards them through `/api/portal-tour-inquiries/proposals` (the same
 * pending-action confirm gate the assistant uses). Nothing books or emails a
 * guest until the manager approves here.
 */
export function TourProposalsPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const loadProposals = useCallback(async () => {
    try {
      const res = await fetch("/api/portal-tour-inquiries/proposals", { credentials: "include" });
      if (res.status === 401) {
        setUnavailable(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { proposals?: Proposal[] };
      setProposals(Array.isArray(data.proposals) ? data.proposals : []);
    } catch {
      /* leave the list as-is on a transient failure */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/portal/automation-settings", { credentials: "include" });
        if (res.status === 401) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as {
          settings?: { proposeTourConfirmations?: boolean };
        };
        if (!cancelled) setEnabled(data.settings?.proposeTourConfirmations === true);
      } catch {
        if (!cancelled) setEnabled(false);
      }
      if (!cancelled) await loadProposals();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProposals]);

  const toggle = useCallback(
    async (next: boolean) => {
      setSavingToggle(true);
      setError(null);
      const prev = enabled;
      setEnabled(next);
      try {
        const res = await fetch("/api/portal/automation-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ proposeTourConfirmations: next }),
        });
        if (!res.ok) throw new Error("Could not save setting.");
      } catch (e) {
        setEnabled(prev ?? false);
        setError(e instanceof Error ? e.message : "Could not save setting.");
      } finally {
        setSavingToggle(false);
      }
    },
    [enabled],
  );

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
        if (decision === "approve") await syncScheduleRecordsFromServer({ force: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update proposal.");
        await loadProposals();
      } finally {
        setBusyId(null);
      }
    },
    [loadProposals],
  );

  if (unavailable || enabled === null) return null;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4"
      aria-label="Tour confirmation proposals"
      data-attr="tour-proposals-panel"
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 accent-primary"
          checked={enabled}
          disabled={savingToggle}
          onChange={(e) => void toggle(e.target.checked)}
          data-attr="tour-proposals-optin"
        />
        <span>
          <span className="font-semibold text-foreground">Propose tour confirmations for my approval</span>
          <span className="mt-0.5 block text-xs text-muted">
            When a new tour request arrives, PropLane suggests confirming it into your first open slot. Nothing is booked
            or sent until you approve it here.
          </span>
        </span>
      </label>

      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}

      {proposals.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {proposals.map((proposal) => (
            <li key={proposal.id} className="rounded-xl border border-border bg-background/40 p-3">
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
                  disabled={busyId === proposal.id}
                  onClick={() => void decide(proposal.id, "approve")}
                  className="h-9 min-h-0 px-4 text-[13px]"
                  data-attr="tour-proposal-approve"
                >
                  {proposal.preview.confirmLabel || "Confirm tour"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyId === proposal.id}
                  onClick={() => void decide(proposal.id, "discard")}
                  className="h-9 min-h-0 px-4 text-[13px]"
                  data-attr="tour-proposal-discard"
                >
                  Discard
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : enabled ? (
        <p className="mt-3 text-xs text-muted">No tour proposals waiting. New requests that match an open slot will appear here.</p>
      ) : null}
    </section>
  );
}
