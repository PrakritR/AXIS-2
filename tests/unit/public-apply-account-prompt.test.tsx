// @vitest-environment jsdom
//
// Covers the captain-decided apply/account model: a prospective resident CREATES
// AN ACCOUNT (primary), can Sign in (returning), or Continue as guest (last
// option), and the Create-account action carries the listing context through
// signup so the renter lands back on this application.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  publicApplyCreateAccountHref,
  publicApplySignInHref,
} from "@/lib/rental-application/public-apply-session";

// The prompt checks the Supabase session on mount — force "not signed in" so the
// gate renders its three actions.
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
  }),
}));

import { PublicApplyAccountPrompt } from "@/components/marketing/public-apply-account-prompt";

const PROPERTY_ID = "mgr-qa-madison-9f3k2z";

describe("publicApply href helpers carry listing context", () => {
  it("create-account href targets resident signup with the apply next", () => {
    const href = publicApplyCreateAccountHref(PROPERTY_ID);
    expect(href).toContain("/auth/create-account");
    expect(href).toContain("role=resident");
    // next must round-trip back to this listing's application
    const next = new URL(href, "http://x").searchParams.get("next");
    expect(next).toBe(`/rent/apply?propertyId=${PROPERTY_ID}`);
  });

  it("sign-in href carries the same apply next for returning residents", () => {
    const next = new URL(publicApplySignInHref(PROPERTY_ID), "http://x").searchParams.get("next");
    expect(next).toBe(`/rent/apply?propertyId=${PROPERTY_ID}`);
  });
});

describe("PublicApplyAccountPrompt renders three ordered actions", () => {
  beforeEach(() => {
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
  afterEach(() => cleanup());

  it("offers Create account (primary), Sign in, and guest — with create carrying context", async () => {
    render(
      <PublicApplyAccountPrompt
        propertyId={PROPERTY_ID}
        propertyTitle="QA Madison Studio"
        onContinueGuest={() => {}}
      />,
    );

    const create = await screen.findByText("Create account");
    const signIn = screen.getByText("Sign in");
    const guest = screen.getByText("Continue without an account");

    expect(create).toBeTruthy();
    expect(signIn).toBeTruthy();
    expect(guest).toBeTruthy();

    // Create account is the recommended path and carries the listing context.
    const createHref = create.closest("a")?.getAttribute("href") ?? "";
    expect(createHref).toContain("/auth/create-account");
    expect(createHref).toContain(encodeURIComponent(`/rent/apply?propertyId=${PROPERTY_ID}`));

    // Sign in stays a real link for returning residents.
    expect(signIn.closest("a")?.getAttribute("href")).toContain("/auth/sign-in");
  });
});
