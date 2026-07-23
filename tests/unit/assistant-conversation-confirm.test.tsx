// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

import { useAssistantConversation } from "@/lib/axis-assistant/use-assistant-conversation";

/**
 * Confirm-outcome retry semantics for the ONE assistant transport.
 *
 * The server's fail-closed peek answers 503 WITHOUT claiming the proposal, so
 * the row is still `proposed` and "Please try again" is real advice — the card
 * has to survive. Every terminal outcome (410 gone/expired/replayed, 400
 * refused) spends or refuses the row, so the card must clear. Residents and
 * vendors have no dashboard AI-drafts list, so a card cleared on a retryable
 * failure orphans a live proposal for good.
 */
const ENDPOINT = "/api/agent/chat";

const PENDING = {
  id: "pa_1",
  preview: {
    kind: "send_rent_reminder",
    title: "Send rent reminder",
    confirmLabel: "Send reminder",
    fields: [{ label: "Recipient", value: "Jordan Lee" }],
  },
};

function installFetch(confirmResponse: { status: number; body: Record<string, unknown> }) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    if (body.confirmActionId || body.denyActionId) {
      return {
        ok: confirmResponse.status >= 200 && confirmResponse.status < 300,
        status: confirmResponse.status,
        json: async () => confirmResponse.body,
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ reply: "Here's the reminder.", pendingAction: PENDING }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function proposeThenConfirm(confirmResponse: { status: number; body: Record<string, unknown> }) {
  installFetch(confirmResponse);
  const { result } = renderHook(() => useAssistantConversation(ENDPOINT));

  await act(async () => {
    await result.current.send("remind Jordan about rent");
  });
  await waitFor(() => expect(result.current.pendingAction?.id).toBe("pa_1"));

  await act(async () => {
    await result.current.resolvePendingAction("confirm");
  });
  return result;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAssistantConversation confirm outcomes", () => {
  it("KEEPS the card on a retryable 503 and surfaces the error, so Confirm can be pressed again", async () => {
    const result = await proposeThenConfirm({
      status: 503,
      body: { error: "This action could not be confirmed right now. Please try again." },
    });

    expect(result.current.pendingAction?.id).toBe("pa_1");
    expect(result.current.error).toContain("try again");
    expect(result.current.loading).toBe(false);
  });

  it("CLEARS the card on a terminal 410 — the proposal is spent", async () => {
    const result = await proposeThenConfirm({
      status: 410,
      body: { error: "This action is no longer available. Ask the assistant again." },
    });

    expect(result.current.pendingAction).toBeNull();
    expect(result.current.error).toContain("no longer available");
    expect(result.current.loading).toBe(false);
  });

  it("CLEARS the card on a terminal 400 refusal", async () => {
    const result = await proposeThenConfirm({
      status: 400,
      body: { error: "This action could not be executed." },
    });

    expect(result.current.pendingAction).toBeNull();
    expect(result.current.error).toBe("This action could not be executed.");
  });

  it("CLEARS the card on success and appends the reply", async () => {
    const result = await proposeThenConfirm({ status: 200, body: { reply: "Reminder sent." } });

    expect(result.current.pendingAction).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.messages.at(-1)).toEqual({ role: "assistant", content: "Reminder sent." });
  });

  it("KEEPS the card when the confirm request never reaches the server", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (body.confirmActionId) throw new Error("network down");
      return {
        ok: true,
        status: 200,
        json: async () => ({ reply: "Here's the reminder.", pendingAction: PENDING }),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAssistantConversation(ENDPOINT));
    await act(async () => {
      await result.current.send("remind Jordan about rent");
    });
    await waitFor(() => expect(result.current.pendingAction?.id).toBe("pa_1"));

    await act(async () => {
      await result.current.resolvePendingAction("confirm");
    });

    expect(result.current.pendingAction?.id).toBe("pa_1");
    expect(result.current.error).toBe("Network error.");
    expect(result.current.loading).toBe(false);
  });
});
