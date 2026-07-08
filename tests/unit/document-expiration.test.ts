import { describe, expect, it } from "vitest";
import {
  defaultExpiryIsoForCategory,
  documentExpirationBucket,
  documentMatchesExpiryFilter,
  parseExpiresAtInput,
  summarizeDocumentExpiration,
} from "@/lib/documents/document-expiration";

describe("document-expiration", () => {
  const now = new Date("2026-07-08T12:00:00.000Z");

  it("defaults insurance and inspection to one year out", () => {
    const iso = defaultExpiryIsoForCategory("insurance", now);
    expect(iso).toBe("2027-07-08T12:00:00.000Z");
    expect(defaultExpiryIsoForCategory("lease", now)).toBeNull();
  });

  it("classifies expiration buckets", () => {
    expect(documentExpirationBucket("2026-06-01T00:00:00.000Z", now)).toBe("expired");
    expect(documentExpirationBucket("2026-07-20T00:00:00.000Z", now)).toBe("within30");
    expect(documentExpirationBucket("2026-08-20T00:00:00.000Z", now)).toBe("within60");
    expect(documentExpirationBucket("2026-10-01T00:00:00.000Z", now)).toBe("within90");
    expect(documentExpirationBucket("2027-01-01T00:00:00.000Z", now)).toBe("ok");
    expect(documentExpirationBucket(null, now)).toBe("none");
  });

  it("summarizes counts", () => {
    const summary = summarizeDocumentExpiration(
      [
        { expiresAt: "2026-06-01T00:00:00.000Z" },
        { expiresAt: "2026-07-20T00:00:00.000Z" },
        { expiresAt: "2026-08-20T00:00:00.000Z" },
        { expiresAt: "2026-10-01T00:00:00.000Z" },
      ],
      now,
    );
    expect(summary).toEqual({ expired: 1, within30: 1, within60: 1, within90: 1 });
  });

  it("filters by expiry window", () => {
    const expiringSoon = "2026-07-20T00:00:00.000Z";
    expect(documentMatchesExpiryFilter(expiringSoon, "30", now)).toBe(true);
    expect(documentMatchesExpiryFilter(expiringSoon, "expired", now)).toBe(false);
    expect(documentMatchesExpiryFilter("2026-06-01T00:00:00.000Z", "30", now)).toBe(true);
  });

  it("parses date input", () => {
    expect(parseExpiresAtInput("2026-12-31")).toBe("2026-12-31T12:00:00.000Z");
    expect(parseExpiresAtInput("")).toBeNull();
    expect(parseExpiresAtInput("not-a-date")).toBeNull();
  });
});
