// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { PublicNavbar } from "@/components/layout/public-navbar";

describe("landing-page assistant placement", () => {
  afterEach(() => {
    cleanup();
    pathname = "/";
  });

  it("moves Ask PropLane out of the landing navbar and into the bottom-right launcher", () => {
    render(<PublicNavbar />);

    const trigger = screen.getByRole("button", { name: "Ask PropLane" });
    expect(trigger).toHaveClass("fixed");
    expect(trigger).toHaveClass("bottom-[max(1rem,env(safe-area-inset-bottom))]");
    expect(document.querySelector("#axis-public-navbar [data-attr='general-assistant-open']")).toBeNull();
  });
});
