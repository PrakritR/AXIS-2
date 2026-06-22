import { describe, expect, it } from "vitest";
import { canNavigateToWizardStep, nextWizardMaxReached } from "@/lib/wizard-step-nav";

describe("wizard-step-nav", () => {
  it("blocks forward jumps past max reached", () => {
    expect(canNavigateToWizardStep(0, 0)).toBe(true);
    expect(canNavigateToWizardStep(1, 0)).toBe(false);
    expect(canNavigateToWizardStep(3, 2)).toBe(false);
    expect(canNavigateToWizardStep(2, 2)).toBe(true);
  });

  it("advances max reached monotonically", () => {
    expect(nextWizardMaxReached(2, 3)).toBe(3);
    expect(nextWizardMaxReached(5, 3)).toBe(5);
  });
});
