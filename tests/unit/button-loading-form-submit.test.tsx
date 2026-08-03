// @vitest-environment jsdom
//
// The shared Button tracks a promise returned from `onClick`, but a
// `type="submit"` button inside a `<form onSubmit>` never owns that promise —
// the form does. Those call sites have to opt in with the explicit `loading`
// prop, and for a while none of them did, so the async submit buttons rendered
// no spinner and no `aria-busy`.
//
// This pins the wiring at a real call site (the public "Ask PropLane" search),
// not just the primitive: submitting while the request is in flight must show
// the spinner, set `aria-busy` and disable the button.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ResidentHousingChat } from "@/components/marketing/resident-listing-search";

vi.mock("@/lib/analytics/track-client", () => ({ track: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { get_distinct_id: () => "test-distinct-id" } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("form-submit Button loading wiring", () => {
  it("spins, sets aria-busy and disables while the search request is in flight", async () => {
    let resolveFetch!: (v: unknown) => void;
    const inFlight = new Promise((res) => {
      resolveFetch = res;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => inFlight),
    );

    render(<ResidentHousingChat onApplyFilters={() => {}} />);

    const input = screen.getByLabelText(/describe the home/i);
    fireEvent.change(input, { target: { value: "2 bed under $2000" } });

    const submit = screen.getByRole("button", { name: /search/i });
    expect(screen.queryByTestId("button-spinner")).toBeNull();
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);

    expect(screen.queryByTestId("button-spinner")).not.toBeNull();
    expect(submit.getAttribute("aria-busy")).toBe("true");
    expect(submit).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({ filters: {}, listings: [], matchCount: 0 }) });
    await inFlight;
    // Flush the state updates queued after the awaited fetch.
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByTestId("button-spinner")).toBeNull();
    expect(submit.getAttribute("aria-busy")).toBeNull();
  });
});
