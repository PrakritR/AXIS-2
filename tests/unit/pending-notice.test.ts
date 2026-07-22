// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingNotice,
  PENDING_NOTICE_TTL_MS,
  queuePendingNotice,
  takePendingNotice,
  VENDOR_PORTAL_PATH,
} from "@/lib/pending-notice";

/**
 * The vendor signup flows end in `window.location.replace`, which destroys any
 * toast fired just before it — so the "your account is not linked to a manager"
 * notice never reached the vendor. It is queued here and rendered by the
 * destination instead. Two things keep that from leaking: a TTL, and a
 * destination guard, because only one of the three exits from signup actually
 * reloads the page.
 */
const NOTICE = { message: "That invite link has expired.", pathPrefix: VENDOR_PORTAL_PATH };

describe("pending notice handoff", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("delivers a queued message at its destination", () => {
    queuePendingNotice(NOTICE);
    expect(takePendingNotice("/vendor/dashboard")).toBe(NOTICE.message);
  });

  it("delivers at the destination root too", () => {
    queuePendingNotice(NOTICE);
    expect(takePendingNotice("/vendor")).toBe(NOTICE.message);
  });

  it("clears on read so the notice can never render twice", () => {
    queuePendingNotice(NOTICE);
    takePendingNotice("/vendor/dashboard");
    expect(takePendingNotice("/vendor/dashboard")).toBeNull();
  });

  it("withholds — but keeps — a notice read from an unrelated page", () => {
    queuePendingNotice(NOTICE);
    expect(takePendingNotice("/portal/dashboard")).toBeNull();
    expect(takePendingNotice("/vendor/dashboard")).toBe(NOTICE.message);
  });

  it("does not treat a lookalike path as the destination", () => {
    queuePendingNotice(NOTICE);
    expect(takePendingNotice("/vendors/dashboard")).toBeNull();
  });

  it("ignores the query string and trailing slash when matching", () => {
    queuePendingNotice(NOTICE);
    expect(takePendingNotice("/vendor/dashboard/?welcome=1")).toBe(NOTICE.message);
  });

  it("discards a notice that outlived its TTL rather than surfacing it later", () => {
    const queuedAt = 1_000_000;
    queuePendingNotice(NOTICE, queuedAt);
    expect(takePendingNotice("/vendor/dashboard", queuedAt + PENDING_NOTICE_TTL_MS + 1)).toBeNull();
    // …and does not linger for the next page load either.
    expect(takePendingNotice("/vendor/dashboard", queuedAt + 1)).toBeNull();
  });

  it("still delivers just inside the TTL", () => {
    const queuedAt = 1_000_000;
    queuePendingNotice(NOTICE, queuedAt);
    expect(takePendingNotice("/vendor/dashboard", queuedAt + PENDING_NOTICE_TTL_MS - 1)).toBe(NOTICE.message);
  });

  it("returns null when nothing was queued", () => {
    expect(takePendingNotice("/vendor/dashboard")).toBeNull();
  });

  it("ignores a blank message or a missing destination", () => {
    queuePendingNotice({ message: "   ", pathPrefix: VENDOR_PORTAL_PATH });
    expect(takePendingNotice("/vendor/dashboard")).toBeNull();
    queuePendingNotice({ message: "orphan", pathPrefix: "  " });
    expect(takePendingNotice("/vendor/dashboard")).toBeNull();
  });

  it("discards a corrupt entry instead of throwing", () => {
    window.sessionStorage.setItem("axis:pending-notice", "{not json");
    expect(takePendingNotice("/vendor/dashboard")).toBeNull();
  });

  it("keeps only the most recent notice", () => {
    queuePendingNotice({ ...NOTICE, message: "first" });
    queuePendingNotice({ ...NOTICE, message: "second" });
    expect(takePendingNotice("/vendor/dashboard")).toBe("second");
  });

  it("can be cleared explicitly", () => {
    queuePendingNotice(NOTICE);
    clearPendingNotice();
    expect(takePendingNotice("/vendor/dashboard")).toBeNull();
  });
});
