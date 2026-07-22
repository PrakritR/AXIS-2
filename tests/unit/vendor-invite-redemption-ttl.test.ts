import { describe, expect, it, vi } from "vitest";
import { findPendingVendorInviteByToken } from "@/lib/auth/provision-vendor-account";

/**
 * `vendor_invites` was directly INSERT-able by any authenticated user (the
 * `FOR ALL` policy's `WITH CHECK (manager_user_id = auth.uid())` is satisfied
 * by naming yourself as the manager). Redemption turns an invite into a
 * **pre-confirmed** account on the invite's email, so a forged row meant an
 * account on an email the attacker does not control.
 *
 * The grant is revoked in 20260722120000_lock_role_grant_surface.sql. This
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
