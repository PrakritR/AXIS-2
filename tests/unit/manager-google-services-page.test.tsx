// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

import ManagerGoogleServicesPage from "@/app/auth/manager/connect-google/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockClear();
});

describe("manager Google services page", () => {
  it("offers independent Calendar and Gmail consent plus a non-blocking skip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("google-calendar")) {
          return new Response(JSON.stringify({ connected: false, email: null, configured: true }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({ status: { connected: false, email: null, configured: true } }),
          { status: 200 },
        );
      }),
    );

    render(<ManagerGoogleServicesPage />);

    await waitFor(() => expect(screen.getByText("Connect Calendar")).toBeTruthy());
    expect(screen.getByText("Connect Gmail")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy();

    const calendarLink = screen.getByText("Connect Calendar").closest("a");
    const gmailLink = screen.getByText("Connect Gmail").closest("a");
    expect(calendarLink?.getAttribute("href")).toContain("/api/portal/google-calendar/connect");
    expect(gmailLink?.getAttribute("href")).toContain("/api/portal/gmail-payments/connect");
    expect(calendarLink?.getAttribute("href")).not.toBe(gmailLink?.getAttribute("href"));
  });
});
