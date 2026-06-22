/** Gate top-nav step jumps: only steps the user has already advanced to via Continue. */
export function canNavigateToWizardStep(targetIndex: number, maxReachedIndex: number): boolean {
  return targetIndex >= 0 && targetIndex <= maxReachedIndex;
}

export function nextWizardMaxReached(maxReached: number, nextIndex: number): number {
  return Math.max(maxReached, nextIndex);
}
