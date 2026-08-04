/**
 * ONE source of truth for what the application wizard says about the
 * application fee.
 *
 * The Review step printed `applicationFeeGate.displayLabel` unconditionally —
 * the LISTING's published fee — while the very next screen said "No application
 * fee is required. Your first application fee already covers additional
 * applications." So the applicant read `$50.00` and then `$0`, back to back,
 * for the same charge (manager audit F-FIN-1 / resident audit F8).
 *
 * Both screens now derive their copy here, so they cannot disagree again.
 * Coverage: `tests/unit/application-fee-display.test.ts`.
 */

export type ApplicationFeeGateView = {
  needsFee: boolean;
  paid: boolean;
  displayLabel: string;
  /** Policy waiver — absent on the wizard's prop type, which pre-dates it. */
  waived?: boolean;
  /** Server fee preview still in flight; no fee claim may be made yet. */
  pending?: boolean;
};

/** True once the server has answered — until then no fee claim may be made. */
function resolved(gate: ApplicationFeeGateView): boolean {
  return !gate.pending;
}

/** The published listing fee, or `null` when the listing publishes none. */
export function publishedApplicationFeeLabel(gate: ApplicationFeeGateView): string | null {
  const label = gate.displayLabel?.trim() ?? "";
  if (!label || label === "—" || label === "…") return null;
  return label;
}

/**
 * What the applicant will ACTUALLY be charged — `"$0.00"` whenever the fee is
 * waived or already covered, never the listing's published amount.
 */
export function applicationFeeChargeLabel(gate: ApplicationFeeGateView): string {
  if (!resolved(gate)) return "…";
  if (!gate.needsFee) return "$0.00";
  return publishedApplicationFeeLabel(gate) ?? "$0.00";
}

/**
 * The one sentence explaining why nothing is due. `codeWaived` is the manager
 * waiver code the applicant redeemed; `gate.waived` is the policy waiver (the
 * fee is collected once per manager, not once per listing).
 */
export function applicationFeeWaiverExplanation(
  gate: ApplicationFeeGateView,
  codeWaived: boolean,
): string {
  if (codeWaived) return "No application fee is due — your waiver code covers it in full.";
  if (gate.waived) {
    return "No application fee is required. Your first application fee already covers additional applications.";
  }
  return "No application fee is required for this listing.";
}

/**
 * Short note the Review row carries beside the amount, so the $50 on screen is
 * never mistaken for what this applicant owes. `null` when the amount stands on
 * its own (a fee that really is due and unpaid).
 */
export function applicationFeeReviewNote(
  gate: ApplicationFeeGateView,
  codeWaived: boolean,
): string | null {
  if (!resolved(gate)) return null;
  if (!gate.needsFee) {
    const published = publishedApplicationFeeLabel(gate);
    const reason = applicationFeeWaiverExplanation(gate, codeWaived);
    return published ? `This listing publishes ${published}. ${reason}` : reason;
  }
  if (gate.paid) return "Already paid.";
  return null;
}
