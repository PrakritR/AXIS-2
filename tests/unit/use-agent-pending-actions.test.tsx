// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

import { useAgentPendingActions } from "@/hooks/use-agent-pending-actions";

/**
 * The dashboard "AI drafts" chips MUST route approval through the existing gated
 * confirm flow: the client sends ONLY the action id to `/api/agent/chat`, where
 * `claimPendingAction` re-validates the server-stored input and runs the
 * handler. These tests pin that the hook never posts model-/client-supplied
 * action arguments at confirm time (no one-click bypass of the preview gate),
 * and that it loads owner-scoped drafts from the list route.
 */

type FetchCall = { url: string; init?: RequestInit };

const DRAFT = {
  id: "pa_1",
  toolName: "send_rent_reminders",
  preview: {
    kind: "send_rent_reminders",
    title: "Rent reminder",
    confirmLabel: "Send reminder",
    fields: [{ label: "Recipient", value: "Jordan Lee" }],
  },
  createdAt: "2026-07-23T00:00:00.000Z",
};

/**
 * Fetch fake that models the real server: the list route only returns drafts
 * still `proposed`, so once a confirm/deny claims one it stops appearing on the
 * next refetch (mirroring `claimPendingAction` flipping the row).
 */
function installFetch() {
  const calls: FetchCall[] = [];
  const claimed = new Set<string>();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (String(url).includes("/api/agent/pending-actions")) {
      const actions = claimed.has(DRAFT.id) ? [] : [DRAFT];
      return { ok: true, json: async () => ({ actions }) } as unknown as Response;
    }
    // The confirm/deny POST to /api/agent/chat claims the row server-side.
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
    const id = body.confirmActionId ?? body.denyActionId;
    if (id) claimed.add(id);
    return { ok: true, json: async () => ({ reply: "Done." }) } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAgentPendingActions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number,
    );
  });

  it("loads the manager's open drafts from the list route when enabled", async () => {
    const { calls } = installFetch();
    const { result } = renderHook(() => useAgentPendingActions({ enabled: true }));

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]!.id).toBe("pa_1");
    expect(calls.some((c) => c.url.includes("/api/agent/pending-actions"))).toBe(true);
  });

  it("does not fetch and stays empty when disabled (e.g. /demo or signed out)", async () => {
    const { fetchMock } = installFetch();
    const { result } = renderHook(() => useAgentPendingActions({ enabled: false }));
    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("approve posts ONLY the action id to the confirm route — never the stored input", async () => {
    const { calls } = installFetch();
    const { result } = renderHook(() => useAgentPendingActions({ enabled: true }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.resolve("pa_1", "confirm");
    });

    const post = calls.find((c) => c.url === "/api/agent/chat" && c.init?.method === "POST");
    expect(post).toBeTruthy();
    const body = JSON.parse(String(post!.init!.body));
    // The ONLY thing on the wire is the id. No tool input, no charge ids, no
    // model-supplied args — the server re-resolves everything from the proposal.
    expect(Object.keys(body)).toEqual(["confirmActionId"]);
    expect(body.confirmActionId).toBe("pa_1");
    expect(body).not.toHaveProperty("input");
    expect(body).not.toHaveProperty("chargeIds");
    // The approved row is dropped from the surfaced chips.
    await waitFor(() => expect(result.current.items).toHaveLength(0));
  });

  it("discard posts ONLY the deny id", async () => {
    const { calls } = installFetch();
    const { result } = renderHook(() => useAgentPendingActions({ enabled: true }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.resolve("pa_1", "deny");
    });

    const post = calls.find((c) => c.url === "/api/agent/chat" && c.init?.method === "POST");
    const body = JSON.parse(String(post!.init!.body));
    expect(Object.keys(body)).toEqual(["denyActionId"]);
    expect(body.denyActionId).toBe("pa_1");
  });
});
