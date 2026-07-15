import { describe, it, expect } from "vitest";
import {
  createPendingAction,
  claimPendingAction,
  denyPendingAction,
  markPendingActionFailed,
} from "@/lib/tools/pending-actions";
import { makeWritableCtx } from "./fake-agent-ctx";

/**
 * These tests pin the confirm-security guarantees: a pending action can be
 * claimed exactly once, only by the landlord who owns it, and only before it
 * expires. The claim is what makes a replayed or tampered confirm a no-op.
 */

const preview = { kind: "test", title: "t", confirmLabel: "Do", fields: [] };

describe("pending actions", () => {
  it("stores the proposal and claims it exactly once (replay returns null)", async () => {
    const { ctx, store } = makeWritableCtx();
    const id = await createPendingAction(ctx, "do_thing", { target: "abc" }, preview);
    expect(id).toBeTruthy();
    expect(store.agent_pending_actions).toHaveLength(1);
    expect(store.agent_pending_actions![0]).toMatchObject({
      landlord_id: "manager_a",
      tool_name: "do_thing",
      status: "proposed",
    });

    const claimed = await claimPendingAction(ctx, id!);
    expect(claimed).toEqual({ toolName: "do_thing", input: { target: "abc" } });
    expect(store.agent_pending_actions![0]).toMatchObject({ status: "executed" });

    // Replay: the same id can never execute twice.
    expect(await claimPendingAction(ctx, id!)).toBeNull();
  });

  it("rejects a claim from another landlord (tampered confirm)", async () => {
    const { ctx, store } = makeWritableCtx();
    const id = await createPendingAction(ctx, "do_thing", { target: "abc" }, preview);

    const { ctx: foreignCtx } = makeWritableCtx({ agent_pending_actions: store.agent_pending_actions! }, {
      landlordId: "manager_b",
      userId: "manager_b",
    });
    expect(await claimPendingAction(foreignCtx, id!)).toBeNull();
    // Untouched: the rightful landlord can still act on it.
    expect(store.agent_pending_actions![0]).toMatchObject({ status: "proposed" });
  });

  it("rejects unknown ids and expired proposals", async () => {
    const { ctx, store } = makeWritableCtx();
    expect(await claimPendingAction(ctx, "no-such-id")).toBeNull();
    expect(await claimPendingAction(ctx, "")).toBeNull();

    const id = await createPendingAction(ctx, "do_thing", {}, preview);
    store.agent_pending_actions![0]!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await claimPendingAction(ctx, id!)).toBeNull();
  });

  it("marks a claimed action as failed when execution throws, never back to proposed", async () => {
    const { ctx, store } = makeWritableCtx();
    const id = await createPendingAction(ctx, "do_thing", {}, preview);
    await claimPendingAction(ctx, id!);

    await markPendingActionFailed(ctx, id!);
    expect(store.agent_pending_actions![0]).toMatchObject({ status: "failed" });
    // A failed action can never be claimed again — a retry needs a new proposal.
    expect(await claimPendingAction(ctx, id!)).toBeNull();
  });

  it("denies a proposal, after which it cannot be claimed", async () => {
    const { ctx, store } = makeWritableCtx();
    const id = await createPendingAction(ctx, "do_thing", {}, preview);

    expect(await denyPendingAction(ctx, id!)).toBe(true);
    expect(store.agent_pending_actions![0]).toMatchObject({ status: "denied" });
    expect(await claimPendingAction(ctx, id!)).toBeNull();
    // Denying twice is also a no-op.
    expect(await denyPendingAction(ctx, id!)).toBe(false);
  });
});
