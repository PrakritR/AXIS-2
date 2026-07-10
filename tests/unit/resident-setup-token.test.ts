import { describe, expect, it } from "vitest";
import type { DemoApplicantRow } from "@/data/demo-portal";
import {
  attachResidentSetupToken,
  buildResidentSetupHref,
  hashResidentSetupToken,
  isResidentSetupTokenValid,
  markResidentSetupTokenConsumed,
  residentSetupAccountUrl,
} from "@/lib/auth/resident-setup-token";

function baseRow(overrides: Partial<DemoApplicantRow> = {}): DemoApplicantRow {
  return {
    id: "AXIS-ABC12345",
    name: "Alex Chen",
    property: "Sunset House",
    stage: "Submitted",
    bucket: "pending",
    detail: "Submitted",
    email: "alex@example.com",
    ...overrides,
  };
}

describe("resident-setup-token", () => {
  it("hashes tokens and validates matching raw tokens", () => {
    const now = new Date();
    const { row, token } = attachResidentSetupToken(baseRow(), {
      now,
      ttlMs: 60_000,
    });
    expect(row.setupTokenHash).toBe(hashResidentSetupToken(token));
    expect(row.setupTokenExpiresAt).toBe(new Date(now.getTime() + 60_000).toISOString());
    expect(row.setupTokenConsumedAt).toBeNull();
    expect(isResidentSetupTokenValid(row, token)).toBe(true);
    expect(isResidentSetupTokenValid(row, "wrong-token")).toBe(false);
  });

  it("rejects expired and consumed tokens", () => {
    const { row, token } = attachResidentSetupToken(baseRow(), {
      now: new Date(),
      ttlMs: 60_000,
    });
    expect(isResidentSetupTokenValid({ ...row, setupTokenExpiresAt: "2020-01-01T00:00:00.000Z" }, token)).toBe(false);
    expect(isResidentSetupTokenValid(markResidentSetupTokenConsumed(row), token)).toBe(false);
  });

  it("builds setup href and absolute URL", () => {
    expect(buildResidentSetupHref("tok_abc", "AXIS-1")).toBe(
      "/auth/resident-setup?token=tok_abc&axis_id=AXIS-1",
    );
    expect(residentSetupAccountUrl("https://www.axis-seattle-housing.com", "tok_abc", "AXIS-1")).toBe(
      "https://www.axis-seattle-housing.com/auth/resident-setup?token=tok_abc&axis_id=AXIS-1",
    );
  });
});
