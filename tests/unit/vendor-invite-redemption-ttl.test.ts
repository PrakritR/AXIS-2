import { describe, expect, it, vi } from "vitest";
import {
  findPendingVendorInviteByEmail,
  findPendingVendorInviteByToken,
  lookupVendorInviteByEmail,
  provisionVendorAccountByEmail,
  VENDOR_INVITE_EXPIRED_ERROR,
} from "@/lib/auth/provision-vendor-account";

/**
 * `vendor_invites` was directly INSERT-able by any authenticated user (the
 * `FOR ALL` policy's `WITH CHECK (manager_user_id = auth.uid())` is satisfied
 * by naming yourself as the manager). Redemption turns an invite into a
 * **pre-confirmed** account on the invite's email, so a forged row meant an
 * account on an email the attacker does not control.
 *
 * The grant is revoked in 20260722123000_lock_role_grant_surface.sql. This
 * covers the second half: the TTL check was `if (invite.expires_at && …)`, so a
 * NULL expiry skipped it entirely. Redemption must fail closed regardless of
 * how a row got there.
 */

function dbWithInvite(invite: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: invite, error: null });
  const eqToken = vi.fn(() => ({ maybeSingle }));
  const eqStatus = vi.fn(() => ({ eq: eqToken }));
  const select = vi.fn(() => ({ eq: eqStatus }));
  return { from: vi.fn(() => ({ select })) } as never;
}

const HOUR = 60 * 60 * 1000;

describe("findPendingVendorInviteByToken — TTL is fail-closed", () => {
  it("rejects an invite with a NULL expiry instead of treating it as eternal", async () => {
    const db = dbWithInvite({ id: "inv-1", vendor_email: "victim@example.com", expires_at: null });
    await expect(findPendingVendorInviteByToken(db, "attacker-chosen")).resolves.toBeNull();
  });

  it("rejects an invite with an unparseable expiry", async () => {
    const db = dbWithInvite({ id: "inv-1", vendor_email: "victim@example.com", expires_at: "not-a-date" });
    await expect(findPendingVendorInviteByToken(db, "attacker-chosen")).resolves.toBeNull();
  });

  it("rejects an expired invite", async () => {
    const db = dbWithInvite({
      id: "inv-1",
      vendor_email: "vendor@example.com",
      expires_at: new Date(Date.now() - HOUR).toISOString(),
    });
    await expect(findPendingVendorInviteByToken(db, "tok")).resolves.toBeNull();
  });

  it("still accepts a genuine, unexpired invite", async () => {
    const db = dbWithInvite({
      id: "inv-1",
      vendor_email: "vendor@example.com",
      expires_at: new Date(Date.now() + HOUR).toISOString(),
    });
    const invite = await findPendingVendorInviteByToken(db, "tok");
    expect(invite).toMatchObject({ id: "inv-1" });
  });

  it("returns null for an unknown token", async () => {
    const db = dbWithInvite(null);
    await expect(findPendingVendorInviteByToken(db, "nope")).resolves.toBeNull();
  });
});

/**
 * The self-serve fallback (`provisionVendorAccountByEmail` with no resolved
 * invite) reaches the same redemption, so expiry — a revocation signal — has to
 * hold identically here. Email ownership is proven on this path, so a stale
 * invite is not escalation, but it must not still link the account to the
 * manager's directory row and scope.
 */
function dbWithEmailInvite(invite: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: invite, error: null });
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const gt = vi.fn(() => ({ order }));
  const eqEmail = vi.fn(() => ({ gt }));
  const eqStatus = vi.fn(() => ({ eq: eqEmail }));
  const select = vi.fn(() => ({ eq: eqStatus }));
  return { db: { from: vi.fn(() => ({ select })) } as never, gt };
}

describe("findPendingVendorInviteByEmail — TTL is fail-closed too", () => {
  it("filters expired rows out in the query rather than redeeming them", async () => {
    const { db, gt } = dbWithEmailInvite(null);
    await findPendingVendorInviteByEmail(db, "vendor@example.com");
    expect(gt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });

  it("rejects an invite with a NULL expiry instead of treating it as eternal", async () => {
    const { db } = dbWithEmailInvite({ id: "inv-1", vendor_email: "victim@example.com", expires_at: null });
    await expect(findPendingVendorInviteByEmail(db, "victim@example.com")).resolves.toBeNull();
  });

  it("rejects an expired invite", async () => {
    const { db } = dbWithEmailInvite({
      id: "inv-1",
      vendor_email: "vendor@example.com",
      expires_at: new Date(Date.now() - HOUR).toISOString(),
    });
    await expect(findPendingVendorInviteByEmail(db, "vendor@example.com")).resolves.toBeNull();
  });

  it("still accepts a genuine, unexpired invite", async () => {
    const { db } = dbWithEmailInvite({
      id: "inv-1",
      vendor_email: "vendor@example.com",
      expires_at: new Date(Date.now() + HOUR).toISOString(),
    });
    await expect(findPendingVendorInviteByEmail(db, "vendor@example.com")).resolves.toMatchObject({ id: "inv-1" });
  });
});

/**
 * Failing closed on the TTL is right; failing SILENTLY is not. Dropping the
 * expired invite left the vendor with an account whose `linkedManagerId` is
 * null, no message explaining why, and a manager who sees nothing to resend.
 * The token path already answers "invalid or has expired"; the email path has
 * to signal it too — without ever redeeming the stale invite.
 */
function dbForEmailLookup(opts: {
  redeemable: Record<string, unknown> | null;
  anyPending: Record<string, unknown> | null;
}) {
  const afterEmail = (row: Record<string, unknown> | null) => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    return { order, gt: vi.fn(() => ({ order })) };
  };
  const select = vi.fn((columns: string) => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => afterEmail(columns.trim() === "id" ? opts.anyPending : opts.redeemable)),
    })),
  }));
  return { from: vi.fn(() => ({ select })) } as never;
}

const UNEXPIRED = {
  id: "inv-1",
  manager_user_id: "mgr-1",
  vendor_email: "vendor@example.com",
  expires_at: new Date(Date.now() + HOUR).toISOString(),
};

describe("lookupVendorInviteByEmail — expired and never-invited are different answers", () => {
  it("reports an expired invite as expired rather than as no invite", async () => {
    const db = dbForEmailLookup({ redeemable: null, anyPending: { id: "inv-1" } });
    await expect(lookupVendorInviteByEmail(db, "vendor@example.com")).resolves.toEqual({ kind: "expired" });
  });

  it("reports a genuine absence as none", async () => {
    const db = dbForEmailLookup({ redeemable: null, anyPending: null });
    await expect(lookupVendorInviteByEmail(db, "vendor@example.com")).resolves.toEqual({ kind: "none" });
  });

  it("returns the redeemable invite without the second query", async () => {
    const db = dbForEmailLookup({ redeemable: UNEXPIRED, anyPending: null });
    await expect(lookupVendorInviteByEmail(db, "vendor@example.com")).resolves.toEqual({
      kind: "redeemable",
      invite: UNEXPIRED,
    });
  });
});

describe("provisionVendorAccountByEmail — self-serve path surfaces expiry", () => {
  // The stub exposes only `from`, so returning here at all proves the handler
  // bailed before any provisioning write (which needs `auth.admin`).
  it("refuses instead of quietly creating an unlinked vendor account", async () => {
    const db = dbForEmailLookup({ redeemable: null, anyPending: { id: "inv-1" } });
    await expect(
      provisionVendorAccountByEmail(db, { userId: "user-1", email: "vendor@example.com" }),
    ).resolves.toEqual({ ok: false, status: 410, error: VENDOR_INVITE_EXPIRED_ERROR });
  });

  it("leaves the explicit-invite paths (token / OAuth) untouched", async () => {
    const db = dbForEmailLookup({ redeemable: null, anyPending: { id: "inv-1" } });
    const from = (db as unknown as { from: ReturnType<typeof vi.fn> }).from;
    await provisionVendorAccountByEmail(db, {
      userId: "user-1",
      email: "vendor@example.com",
      invite: null,
    }).catch(() => null);
    expect(from).not.toHaveBeenCalledWith("vendor_invites");
  });
});
