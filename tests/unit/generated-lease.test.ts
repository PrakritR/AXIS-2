import { describe, expect, it } from "vitest";
import { snapshotJordanLee } from "@/data/manager-application-snapshots";
import { leaseContextFromApplication } from "@/lib/generated-lease";

describe("generated-lease", () => {
  it("builds lease context from application snapshot", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication(app);
    expect(ctx.application.fullLegalName).toContain("Jordan");
    expect(ctx.generatedAtIso).toBeTruthy();
  });
});
