import { describe, expect, it } from "vitest";
import {
  leaseKindFromDraft,
  leaseModeFromDraft,
  type LeaseConfigDraft,
} from "@/components/portal/lease-config-form";

function draft(patch: Partial<LeaseConfigDraft> = {}): LeaseConfigDraft {
  return {
    leaseConfigMode: "standard",
    leaseCustomKind: "terms",
    customLeaseTerms: "",
    leaseTemplateDocUrl: null,
    leaseTemplateDocName: "",
    ...patch,
  };
}

describe("lease config form helpers", () => {
  it("derives lease mode from draft fields", () => {
    expect(leaseModeFromDraft(draft())).toBe("standard");
    expect(leaseModeFromDraft(draft({ leaseConfigMode: "custom" }))).toBe("custom");
  });

  it("derives lease kind from draft fields", () => {
    expect(leaseKindFromDraft(draft())).toBe("terms");
    expect(leaseKindFromDraft(draft({ leaseCustomKind: "document" }))).toBe("document");
  });
});
