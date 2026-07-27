/** Gate top-nav step jumps: only steps the user has already advanced to via Continue. */
export function canNavigateToWizardStep(targetIndex: number, maxReachedIndex: number): boolean {
  return targetIndex >= 0 && targetIndex <= maxReachedIndex;
}

export function nextWizardMaxReached(maxReached: number, nextIndex: number): number {
  return Math.max(maxReached, nextIndex);
}

/** Next step in the ACTIVE step list after `from`; `from` itself when none follows. */
export function nextActiveWizardStep(activeSteps: readonly number[], from: number): number {
  return activeSteps.find((s) => s > from) ?? from;
}

/** Previous step in the ACTIVE step list before `from`; `from` itself when none precedes. */
export function prevActiveWizardStep(activeSteps: readonly number[], from: number): number {
  for (let i = activeSteps.length - 1; i >= 0; i -= 1) {
    if (activeSteps[i] < from) return activeSteps[i];
  }
  return from;
}

/**
 * Progress as position within the ACTIVE step list for this form — never a
 * fixed total, so it stays honest for the shorter short-term form and never
 * implies how long the application is.
 */
export function activeWizardProgressPct(activeSteps: readonly number[], step: number): number {
  if (activeSteps.length === 0) return 0;
  const index = activeSteps.indexOf(step);
  return Math.round((((index < 0 ? 0 : index) + 1) / activeSteps.length) * 100);
}
