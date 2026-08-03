import { describe, expect, it } from "vitest";
import { createCoalescedRefresher } from "@/lib/coalesced-refresh";

/** A fetcher whose runs are resolved by hand, so ordering is deterministic. */
function controllable() {
  const starts: number[] = [];
  const resolvers: Array<(v: string) => void> = [];
  let n = 0;
  const fetcher = () => {
    const id = ++n;
    starts.push(id);
    return new Promise<string>((resolve) => {
      resolvers.push(() => resolve(`run-${id}`));
    });
  };
  return {
    fetcher,
    get runCount() {
      return starts.length;
    },
    settleAll() {
      const pending = resolvers.splice(0, resolvers.length);
      pending.forEach((r) => r("done"));
    },
  };
}

describe("createCoalescedRefresher", () => {
  it("collapses concurrent UNFORCED callers into one request", async () => {
    const c = controllable();
    const r = createCoalescedRefresher(c.fetcher);

    const a = r.run();
    const b = r.run();
    const d = r.run();
    expect(c.runCount).toBe(1);

    c.settleAll();
    await Promise.all([a, b, d]);
    expect(c.runCount).toBe(1);
  });

  it("collapses N concurrent FORCED callers into at most 2 requests", async () => {
    const c = controllable();
    const r = createCoalescedRefresher(c.fetcher);

    const first = r.run(true); // starts run 1
    const b = r.run(true);
    const d = r.run(true);
    const e = r.run(true);
    expect(c.runCount).toBe(1); // the three later ones are queued behind run 1

    c.settleAll(); // run 1 resolves -> queued follow-up starts
    await first;
    await Promise.resolve();
    await Promise.resolve();
    expect(c.runCount).toBe(2); // ONE shared follow-up, not three

    c.settleAll();
    await Promise.all([b, d, e]);
    expect(c.runCount).toBe(2);
  });

  it("never hands a forced caller a request that started before it asked", async () => {
    const c = controllable();
    const r = createCoalescedRefresher(c.fetcher);

    const first = r.run(true); // run 1 begins
    expect(c.runCount).toBe(1);

    // This caller arrives AFTER run 1 started (imagine it just wrote a row and
    // now wants the new state). It must not be handed run 1's result.
    const afterWrite = r.run(true);
    expect(afterWrite).not.toBe(first);

    c.settleAll();
    await first;
    await Promise.resolve();
    await Promise.resolve();
    expect(c.runCount).toBe(2); // a genuinely later fetch was issued for it

    c.settleAll();
    await expect(afterWrite).resolves.toBeDefined();
  });

  it("reopens the queue so a caller arriving after the follow-up starts gets its own", async () => {
    const c = controllable();
    const r = createCoalescedRefresher(c.fetcher);

    const first = r.run(true);
    const second = r.run(true); // queues follow-up
    c.settleAll();
    await first;
    await Promise.resolve();
    await Promise.resolve();
    expect(c.runCount).toBe(2); // follow-up is now in flight

    const third = r.run(true); // arrives after follow-up started -> must queue again
    c.settleAll();
    await second;
    await Promise.resolve();
    await Promise.resolve();
    expect(c.runCount).toBe(3);

    c.settleAll();
    await expect(third).resolves.toBeDefined();
  });

  it("recovers after a rejected run instead of wedging the queue", async () => {
    let n = 0;
    const r = createCoalescedRefresher(async () => {
      n += 1;
      if (n === 1) throw new Error("network down");
      return "ok";
    });

    await expect(r.run(true)).rejects.toThrow("network down");
    await expect(r.run(true)).resolves.toBe("ok");
    expect(n).toBe(2);
  });

  it("lets an unforced caller ride a queued follow-up rather than opening a third run", async () => {
    const c = controllable();
    const r = createCoalescedRefresher(c.fetcher);

    r.run(true); // run 1
    r.run(true); // queued follow-up
    const lazy = r.run(); // unforced: any pending run satisfies it
    expect(c.runCount).toBe(1);

    c.settleAll();
    await Promise.resolve();
    await Promise.resolve();
    c.settleAll();
    await expect(lazy).resolves.toBeDefined();
    expect(c.runCount).toBe(2);
  });
});
