import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "../../helpers/api-request";

/**
 * The admin SMS endpoint is the surface that made the `profiles` /
 * `profile_roles` privilege escalation a platform-wide PII incident rather than
 * a latent flaw: it reads resident message bodies and phone numbers across
 * every manager on the shared line, and sends *as* any manager.
 *
 * Its own admin gate is correct, and the escalation beneath it is closed in
 * 20260722123000_lock_role_grant_surface.sql. What remains here is the one
 * input it did trust: `residentUserId` came straight from the request body and
 * was used as the SMS log's attribution, threading a message under an
 * unrelated resident's conversation key and corrupting the audit trail.
 */

vi.mock("@/lib/auth/admin-preview", () => ({ isAdminUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: vi.fn(() => ({})) }));
vi.mock("@/lib/manager-sms-messages.server", () => ({ fetchAdminSmsConversations: vi.fn() }));
vi.mock("@/lib/proplane-sms-transport.server", () => ({ sendFromManagerWorkNumber: vi.fn() }));
vi.mock("@/lib/claw-resident-messaging.server", () => ({
  resolveAdminForwardPhone: vi.fn().mockResolvedValue(null),
  resolveManagerUserIdForPhone: vi.fn().mockResolvedValue(null),
}));

import { isAdminUser } from "@/lib/auth/admin-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAdminSmsConversations } from "@/lib/manager-sms-messages.server";
import { sendFromManagerWorkNumber } from "@/lib/proplane-sms-transport.server";
import { GET as adminSmsGet, POST as adminSmsPost } from "@/app/api/admin/sms-conversations/route";

const OWNER = "mgr-owner";
const OTHER_MANAGER = "mgr-other";

function signedIn(userId: string | null) {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
  } as never);
}

function conversations() {
  return {
    workNumber: "+15550000000",
    residents: [
      {
        residentUserId: "res-owned",
        ownerManagerUserId: OWNER,
        name: "Owned Resident",
        phone: "+15551112222",
        counterpartyRole: "resident",
        messages: [],
      },
      {
        residentUserId: "res-elsewhere",
        ownerManagerUserId: OTHER_MANAGER,
        name: "Other Manager's Resident",
        phone: "+15553334444",
        counterpartyRole: "resident",
        messages: [],
      },
    ],
  } as never;
}

function post(body: Record<string, unknown>) {
  return adminSmsPost(
    jsonRequest("http://localhost/api/admin/sms-conversations", { method: "POST", body }),
  );
}

describe("/api/admin/sms-conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAdminSmsConversations).mockResolvedValue(conversations());
    vi.mocked(sendFromManagerWorkNumber).mockResolvedValue({ ok: true, channel: "sms", sid: "SM1" } as never);
  });

  describe("admin gate", () => {
    it("rejects an unauthenticated caller on GET and POST", async () => {
      signedIn(null);
      vi.mocked(isAdminUser).mockResolvedValue(false);
      expect((await adminSmsGet()).status).toBe(401);
      expect((await post({ toPhone: "+15551112222", text: "hi" })).status).toBe(401);
      expect(sendFromManagerWorkNumber).not.toHaveBeenCalled();
    });

    it("rejects a signed-in non-admin on GET and POST", async () => {
      signedIn("plain-user");
      vi.mocked(isAdminUser).mockResolvedValue(false);
      expect((await adminSmsGet()).status).toBe(403);
      expect((await post({ toPhone: "+15551112222", text: "hi" })).status).toBe(403);
      expect(fetchAdminSmsConversations).not.toHaveBeenCalled();
      expect(sendFromManagerWorkNumber).not.toHaveBeenCalled();
    });
  });

  describe("log attribution", () => {
    beforeEach(() => {
      signedIn("admin-1");
      vi.mocked(isAdminUser).mockResolvedValue(true);
    });

    it("drops a residentUserId that belongs to a different manager's cohort", async () => {
      // Unknown recipient number, so the owner falls back to the shared-line
      // anchor manager — the body's residentUserId must not ride along.
      const res = await post({ toPhone: "+19998887777", text: "hi", residentUserId: "res-elsewhere" });
      expect(res.status).toBe(200);
      expect(vi.mocked(sendFromManagerWorkNumber).mock.calls[0][0]).toMatchObject({
        managerUserId: OWNER,
        residentUserId: null,
      });
    });

    it("drops a residentUserId that does not exist at all", async () => {
      const res = await post({ toPhone: "+19998887777", text: "hi", residentUserId: "res-invented" });
      expect(res.status).toBe(200);
      expect(vi.mocked(sendFromManagerWorkNumber).mock.calls[0][0]).toMatchObject({ residentUserId: null });
    });

    it("keeps attribution resolved from the recipient phone", async () => {
      const res = await post({ toPhone: "+15551112222", text: "hi" });
      expect(res.status).toBe(200);
      expect(vi.mocked(sendFromManagerWorkNumber).mock.calls[0][0]).toMatchObject({
        managerUserId: OWNER,
        residentUserId: "res-owned",
      });
    });

    it("never lets the body override the owner resolved from the phone", async () => {
      const res = await post({ toPhone: "+15551112222", text: "hi", residentUserId: "res-elsewhere" });
      expect(res.status).toBe(200);
      const sent = vi.mocked(sendFromManagerWorkNumber).mock.calls[0][0];
      expect(sent).toMatchObject({ managerUserId: OWNER, residentUserId: "res-owned" });
    });
  });
});
