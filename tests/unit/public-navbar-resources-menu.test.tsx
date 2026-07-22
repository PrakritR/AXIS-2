// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The navbar boots a Supabase browser client in an effect; stub it so the
// component mounts without public Supabase env.
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    }),
  }),
}));

// Radix's navigation menu measures its viewport; jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { PublicNavbar } from "@/components/layout/public-navbar";

async function openResourcesMenu() {
  const user = userEvent.setup();
  render(<PublicNavbar />);
  const trigger = (await screen.findAllByRole("button", { name: /resources/i }))[0];
  await user.click(trigger);
  await waitFor(() => expect(screen.getAllByRole("link", { name: /documentation/i }).length).toBeGreaterThan(0));
}

describe("public navbar Resources dropdown", () => {
  afterEach(() => {
    cleanup();
    mockPathname = "/";
  });

  it("lists only Why PropLane, Documentation, and About us — no Pricing entry", async () => {
    await openResourcesMenu();

    expect(screen.getAllByRole("link", { name: /why proplane/i })[0]).toHaveAttribute(
      "href",
      "/why-proplane",
    );
    expect(screen.getAllByRole("link", { name: /documentation/i })[0]).toHaveAttribute("href", "/docs");
    expect(screen.getAllByRole("link", { name: /about us/i })[0]).toHaveAttribute("href", "/about");

    // The Pricing page stays live; it is only the dropdown entry that is gone.
    expect(document.querySelectorAll('a[href="/pricing"]')).toHaveLength(0);
  });

  it("still highlights the Resources tab while on the still-live /pricing page", async () => {
    mockPathname = "/pricing";
    render(<PublicNavbar />);

    const trigger = (await screen.findAllByRole("button", { name: /resources/i }))[0];
    // `docsActive` keeps the /pricing prefix on purpose — active-state
    // highlighting outlives the removed dropdown entry.
    expect(trigger.className).toContain("text-primary");
  });
});
