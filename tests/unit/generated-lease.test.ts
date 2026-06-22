import { describe, expect, it } from "vitest";
import { snapshotJordanLee } from "@/data/manager-application-snapshots";
import { buildAiGeneratedLeaseHtml, leaseContextFromApplication } from "@/lib/generated-lease";
import { resolveApplicationPersonalFields } from "@/lib/application-personal-fields";

describe("generated-lease", () => {
  it("builds lease context from application snapshot", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication(app);
    expect(ctx.application.fullLegalName).toContain("Jordan");
    expect(ctx.generatedAtIso).toBeTruthy();
  });

  it("includes phone, email, and date of birth in generated lease html", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication(app);
    const html = buildAiGeneratedLeaseHtml(ctx);
    expect(html).toContain("(206) 555-0142");
    expect(html).toContain("jordan.lee@example.com");
    expect(html).toContain("1998-03-14");
  });

  it("fills personal fields from row-level fallbacks when application snapshot is sparse", () => {
    const personal = resolveApplicationPersonalFields({
      name: "Sam Rivera",
      email: "sam@example.com",
      application: {
        phone: "(206) 555-0199",
        dateOfBirth: "1995-07-04",
      },
    });
    const ctx = leaseContextFromApplication(personal);
    expect(ctx.application.fullLegalName).toBe("Sam Rivera");
    expect(ctx.application.email).toBe("sam@example.com");
    expect(ctx.application.phone).toBe("(206) 555-0199");
    expect(ctx.application.dateOfBirth).toBe("1995-07-04");
  });
});
