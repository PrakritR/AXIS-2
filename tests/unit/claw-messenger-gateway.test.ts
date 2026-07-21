import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GATEWAY_PATH = "../../scripts/claw-messenger-gateway.mjs";

type GatewayModule = {
  debounceMs: number;
  debounceKey: (frame: Record<string, unknown>) => string;
  bufferForDebounce: (frame: Record<string, unknown>) => void;
  flushDebounceBuffer: (key: string) => void;
  flushAllDebounceBuffers: () => void;
  deliverWithRetry: (frame: Record<string, unknown>) => Promise<void>;
  debounceBuffers: Map<string, { frames: Record<string, unknown>[]; timer: unknown }>;
  isManagerPhone: (from: string) => boolean;
  shouldBypassDebounce: (frame: Record<string, unknown>) => boolean;
  __setManagerPhonesForTest: (phones: string[]) => void;
};

async function loadGateway(env: Record<string, string> = {}): Promise<GatewayModule> {
  vi.resetModules();
  process.env.CLAW_MESSENGER_API_KEY = "test-key";
  process.env.AXIS_WEBHOOK_URL = "https://example.test/api/webhooks/claw-messenger";
  delete process.env.CLAW_MESSENGER_DEBOUNCE_SECONDS;
  delete process.env.CLAW_MESSENGER_MANAGER_PHONES_REFRESH_MS;
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return (await import(GATEWAY_PATH)) as GatewayModule;
}

describe("claw-messenger-gateway reply debounce", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("defaults to a 150s quiet window and is configurable via env", async () => {
    const defaultGw = await loadGateway();
    expect(defaultGw.debounceMs).toBe(150_000);

    const customGw = await loadGateway({ CLAW_MESSENGER_DEBOUNCE_SECONDS: "60" });
    expect(customGw.debounceMs).toBe(60_000);

    const disabledGw = await loadGateway({ CLAW_MESSENGER_DEBOUNCE_SECONDS: "0" });
    expect(disabledGw.debounceMs).toBe(0);
  });

  it("buffers repeated inbound texts from the same phone and flushes ONE merged frame after the quiet window from the LAST message", async () => {
    vi.useFakeTimers();
    const gw = await loadGateway({ CLAW_MESSENGER_DEBOUNCE_SECONDS: "150" });

    gw.bufferForDebounce({ type: "message", from: "+12065551234", text: "hi", messageId: "m1" });
    await vi.advanceTimersByTimeAsync(60_000);
    // A new message resets the window — total elapsed since m1 is already 60s,
    // but the flush must wait a full 150s from THIS message.
    gw.bufferForDebounce({
      type: "message",
      from: "+12065551234",
      text: "is 4709A available?",
      messageId: "m2",
    });
    await vi.advanceTimersByTimeAsync(149_000);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(body.text).toBe("hi\nis 4709A available?");
    expect(body.messageId).toBe("m2");
    expect(body.mergedCount).toBe(2);
    expect(body.mergedMessageIds).toEqual(["m1", "m2"]);

    await gw.deliverWithRetry({ type: "message", from: "+12065551234", text: "hi", messageId: "m1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keys buffers per phone so two different prospects never merge", async () => {
    vi.useFakeTimers();
    const gw = await loadGateway({ CLAW_MESSENGER_DEBOUNCE_SECONDS: "150" });

    gw.bufferForDebounce({ type: "message", from: "+12065551111", text: "prospect A", messageId: "a1" });
    gw.bufferForDebounce({ type: "message", from: "+12065552222", text: "prospect B", messageId: "b1" });
    expect(gw.debounceBuffers.size).toBe(2);

    await vi.advanceTimersByTimeAsync(150_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse((init as { body: string }).body) as { from: string; text: string },
    );
    expect(bodies.find((b) => b.from === "+12065551111")?.text).toBe("prospect A");
    expect(bodies.find((b) => b.from === "+12065552222")?.text).toBe("prospect B");
  });

  it("recognizes registered manager phones and bypasses the buffer for them", async () => {
    const gw = await loadGateway({ CLAW_MESSENGER_DEBOUNCE_SECONDS: "150" });
    gw.__setManagerPhonesForTest(["+12065559999"]);

    expect(gw.isManagerPhone("+12065559999")).toBe(true);
    expect(gw.isManagerPhone("+12065551234")).toBe(false);
    expect(gw.shouldBypassDebounce({ from: "+12065559999" })).toBe(true);
    expect(gw.shouldBypassDebounce({ from: "+12065551234" })).toBe(false);
  });

  it("always bypasses debounce for replay frames, regardless of sender", async () => {
    const gw = await loadGateway({ CLAW_MESSENGER_DEBOUNCE_SECONDS: "150" });
    expect(gw.shouldBypassDebounce({ from: "+12065551234", replay: true })).toBe(true);
  });

  it("bypasses debounce entirely when the window is disabled (0)", async () => {
    const gw = await loadGateway({ CLAW_MESSENGER_DEBOUNCE_SECONDS: "0" });
    expect(gw.shouldBypassDebounce({ from: "+12065551234" })).toBe(true);
  });

  it("flushAllDebounceBuffers flushes every pending conversation immediately (graceful shutdown)", async () => {
    vi.useFakeTimers();
    const gw = await loadGateway({ CLAW_MESSENGER_DEBOUNCE_SECONDS: "150" });
    gw.bufferForDebounce({ type: "message", from: "+12065551111", text: "hi", messageId: "a1" });
    gw.bufferForDebounce({ type: "message", from: "+12065552222", text: "yo", messageId: "b1" });

    await gw.flushAllDebounceBuffers();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(gw.debounceBuffers.size).toBe(0);
  });

  it("flushAllDebounceBuffers resolves only after every pending delivery actually completes (graceful-shutdown safety)", async () => {
    const gw = await loadGateway({ CLAW_MESSENGER_DEBOUNCE_SECONDS: "150" });
    let resolveFetch: (() => void) | null = null;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve({ ok: true, status: 200, text: async () => "{}" });
        }),
    );

    gw.bufferForDebounce({ type: "message", from: "+12065551111", text: "hi", messageId: "a1" });
    let settled = false;
    const flush = gw.flushAllDebounceBuffers().then(() => {
      settled = true;
    });

    // The delivery is in-flight (fetch called, not yet resolved) — the flush
    // promise must NOT settle until it does. This is the exact bug a bare
    // process.exit() right after calling flush would hit.
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    resolveFetch?.();
    await flush;
    expect(settled).toBe(true);
  });

  it("flushAllDebounceBuffers also waits for a delivery already in flight", async () => {
    const gw = await loadGateway({ CLAW_MESSENGER_DEBOUNCE_SECONDS: "150" });
    let resolveFetch: (() => void) | null = null;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve({ ok: true, status: 200, text: async () => "{}" });
        }),
    );

    void gw.deliverWithRetry({ type: "message", from: "+12065551111", text: "hi", messageId: "a1" });
    let settled = false;
    const flush = gw.flushAllDebounceBuffers().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveFetch?.();
    await flush;
    expect(settled).toBe(true);
  });
});
