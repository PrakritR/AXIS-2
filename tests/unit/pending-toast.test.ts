// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { queuePendingToast, takePendingToast } from "@/lib/pending-toast";

/**
 * The vendor signup flows end in `window.location.replace`, which destroys any
 * toast fired just before it — so the "your account is not linked to your
 * manager" notice never reached the vendor. Messages that have to survive a
 * navigation are queued here and read once by `AppUiProvider` on arrival.
 */
describe("pending toast handoff", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("delivers a queued message on the next page load", () => {
    queuePendingToast("That invite link has expired.");
    expect(takePendingToast()).toBe("That invite link has expired.");
  });

  it("clears on read so the message is shown exactly once", () => {
    queuePendingToast("shown once");
    takePendingToast();
    expect(takePendingToast()).toBeNull();
  });

  it("returns null when nothing was queued", () => {
    expect(takePendingToast()).toBeNull();
  });

  it("ignores a blank message rather than queueing an empty toast", () => {
    queuePendingToast("   ");
    expect(takePendingToast()).toBeNull();
  });

  it("keeps only the most recent message", () => {
    queuePendingToast("first");
    queuePendingToast("second");
    expect(takePendingToast()).toBe("second");
  });
});
