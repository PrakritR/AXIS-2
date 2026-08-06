// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { markRentalWizardActive } from "@/components/marketing/rental-application-wizard";

afterEach(() => {
  document.documentElement.removeAttribute("data-rental-wizard-active");
});

describe("rental wizard assistant FAB suppression", () => {
  it("keeps the page marked until every responsive wizard copy unmounts", () => {
    const releaseMobile = markRentalWizardActive(document);
    const releaseDesktop = markRentalWizardActive(document);
    expect(document.documentElement.hasAttribute("data-rental-wizard-active")).toBe(true);

    releaseMobile();
    expect(document.documentElement.hasAttribute("data-rental-wizard-active")).toBe(true);

    releaseDesktop();
    expect(document.documentElement.hasAttribute("data-rental-wizard-active")).toBe(false);
  });

  it("makes cleanup idempotent", () => {
    const release = markRentalWizardActive(document);
    release();
    release();
    expect(document.documentElement.hasAttribute("data-rental-wizard-active")).toBe(false);
  });
});
