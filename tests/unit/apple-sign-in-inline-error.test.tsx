// @vitest-environment jsdom
//
// The Apple button's inline failure slot is independent of the toast dedupe.
//
// `shouldShowAppleSignInErrorToast` remembers every message it has shown so a toast fires at
// most once per tab session. The inline slot has no such constraint: each attempt clears it
// first, so gating the re-set on that dedupe left a repeated failure showing nothing at all —
// the same silent "it just did nothing" the native OAuth work exists to remove.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const showToast = vi.fn();
const startAppleSignIn = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({ auth: {} }),
}));

vi.mock("@/components/providers/app-ui-provider", () => ({
  useAppUi: () => ({ showToast }),
}));

vi.mock("@/lib/auth/start-apple-sign-in", () => ({
  startAppleSignIn: (...args: unknown[]) => startAppleSignIn(...args),
}));

// Native Apple sign-in short-circuits the component's web OAuth probe effect.
vi.mock("@/lib/auth/native-apple-sign-in", () => ({
  canUseNativeAppleSignIn: () => true,
}));

const FAILURE = "Apple sign-in is not enabled in this Supabase project.";

describe("AppleSignInButton inline error", () => {
  beforeEach(async () => {
    showToast.mockReset();
    startAppleSignIn.mockReset();
    startAppleSignIn.mockResolvedValue({ ok: false, message: FAILURE });
    const { resetAppleSignInSessionStateForTests } = await import("@/lib/auth/apple-sign-in-config");
    resetAppleSignInSessionStateForTests();
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  it("keeps the reason on screen when the same failure happens twice", async () => {
    const { AppleSignInButton } = await import("@/components/auth/apple-sign-in-button");

    let inlineError = "";
    render(
      <AppleSignInButton
        onError={(message) => {
          inlineError = message;
        }}
      />,
    );

    fireEvent.click(screen.getByText("Continue with Apple"));
    await waitFor(() => expect(inlineError).toBe(FAILURE));
    expect(showToast).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Continue with Apple"));
    await waitFor(() => expect(startAppleSignIn).toHaveBeenCalledTimes(2));

    // The toast stays deduped, but the screen must still explain itself.
    await waitFor(() => expect(inlineError).toBe(FAILURE));
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});
