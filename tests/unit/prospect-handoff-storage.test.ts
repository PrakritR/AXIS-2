import { afterEach, describe, expect, it, vi } from "vitest";
import {
  persistProspectHandoff,
  prospectHandoffFromSearchParams,
  readProspectHandoff,
} from "@/lib/auth/prospect-handoff-storage";

function withSessionStorage(run: () => void) {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      setItem: (k: string, v: string) => store.set(k, v),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  });
  try {
    run();
  } finally {
    vi.unstubAllGlobals();
  }
}

describe("prospect-handoff-storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips tour handoff fields through session storage", () => {
    withSessionStorage(() => {
      const params = new URLSearchParams({
        tour_inquiry: "inq-1",
        name: "Alex Prospect",
        phone: "(206) 555-0100",
        email: "alex@example.com",
        next: "/resident/tour/pending",
      });

      const snapshot = prospectHandoffFromSearchParams(params);
      expect(snapshot).toEqual({
        tourInquiryId: "inq-1",
        fullName: "Alex Prospect",
        phone: "(206) 555-0100",
        email: "alex@example.com",
        nextPath: "/resident/tour/pending",
      });

      persistProspectHandoff(snapshot!);
      expect(readProspectHandoff()).toEqual(snapshot);
    });
  });

  it("accepts message handoff without a tour inquiry id", () => {
    const params = new URLSearchParams({
      handoff: "message",
      email: "alex@example.com",
      next: "/resident/communication/active",
    });

    const snapshot = prospectHandoffFromSearchParams(params);
    expect(snapshot).toEqual({
      handoff: "message",
      email: "alex@example.com",
      nextPath: "/resident/communication/active",
    });
  });
});
