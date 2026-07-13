import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeNotificationPreferences,
  resolveChannels,
} from "@/lib/notification-preferences";

/**
 * Minimal chainable Supabase mock: every `.from(table).select().eq().maybeSingle()`
 * resolves to the row configured for that table. resolveChannels touches
 * `notification_preferences` (saved prefs) and `sms_consent` (opt-out).
 */
function mockDb(rows: {
  notification_preferences?: unknown;
  sms_consent?: unknown;
  profiles?: unknown;
}): SupabaseClient {
  const chain = (data: unknown) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.maybeSingle = async () => ({ data });
    return c;
  };
  return {
    from(table: string) {
      return chain((rows as Record<string, unknown>)[table] ?? null);
    },
  } as unknown as SupabaseClient;
}

const VERIFIED = { phone: "5551234567", phone_verified_at: "2026-01-01T00:00:00Z" };
const UNVERIFIED = { phone: "5551234567", phone_verified_at: null };

describe("resolveChannels — per-category channel gating", () => {
  it("inbox is always on; email defaults on with no saved prefs", async () => {
    const db = mockDb({});
    for (const category of ["messages", "leases", "payments", "maintenance", "applications"] as const) {
      const ch = await resolveChannels(db, "u1", category, VERIFIED);
      expect(ch.inbox).toBe(true);
      expect(ch.email).toBe(true); // default matrix email:true
      expect(ch.sms).toBe(false); // default matrix sms:false for non-account
    }
  });

  it("SMS off (default) suppresses SMS even with a verified phone", async () => {
    const db = mockDb({}); // no saved prefs → payments sms default false
    const ch = await resolveChannels(db, "u1", "payments", VERIFIED);
    expect(ch.sms).toBe(false);
    expect(ch.email).toBe(true);
  });

  it("SMS on + verified + not opted out → SMS sends", async () => {
    const db = mockDb({ notification_preferences: { row_data: { payments: { sms: true } } } });
    const ch = await resolveChannels(db, "u1", "payments", VERIFIED);
    expect(ch.sms).toBe(true);
  });

  it("SMS on but phone NOT verified → no SMS", async () => {
    const db = mockDb({ notification_preferences: { row_data: { payments: { sms: true } } } });
    const ch = await resolveChannels(db, "u1", "payments", UNVERIFIED);
    expect(ch.sms).toBe(false);
  });

  it("SMS on + verified but STOP-opted-out → no SMS", async () => {
    const db = mockDb({
      notification_preferences: { row_data: { payments: { sms: true } } },
      sms_consent: { opted_out_at: "2026-02-01T00:00:00Z", opted_in_at: null },
    });
    const ch = await resolveChannels(db, "u1", "payments", VERIFIED);
    expect(ch.sms).toBe(false);
  });

  it("email off (saved) suppresses email; inbox stays on", async () => {
    const db = mockDb({ notification_preferences: { row_data: { messages: { email: false } } } });
    const ch = await resolveChannels(db, "u1", "messages", VERIFIED);
    expect(ch.email).toBe(false);
    expect(ch.inbox).toBe(true);
  });

  it("account category force-sends SMS even when the pref is off (cannot be silenced)", async () => {
    const db = mockDb({ notification_preferences: { row_data: { account: { sms: false } } } });
    const ch = await resolveChannels(db, "u1", "account", VERIFIED);
    expect(ch.sms).toBe(true); // account ignores the stored sms pref
  });

  it("account still respects a hard STOP opt-out", async () => {
    const db = mockDb({
      sms_consent: { opted_out_at: "2026-02-01T00:00:00Z", opted_in_at: null },
    });
    const ch = await resolveChannels(db, "u1", "account", VERIFIED);
    expect(ch.sms).toBe(false);
  });
});

describe("DEFAULT_NOTIFICATION_PREFERENCES + normalize", () => {
  it("every category defaults email on / sms off, except account sms on", () => {
    for (const [category, ch] of Object.entries(DEFAULT_NOTIFICATION_PREFERENCES)) {
      expect(ch.inbox).toBe(true);
      expect(ch.email).toBe(true);
      expect(ch.sms).toBe(category === "account");
    }
  });

  it("normalize forces inbox on and clamps to the 6 categories", () => {
    const out = normalizeNotificationPreferences({ messages: { inbox: false, sms: true }, bogus: {} });
    expect(out.messages.inbox).toBe(true); // inbox not user-suppressible
    expect(out.messages.sms).toBe(true);
    expect(Object.keys(out).sort()).toEqual(
      ["account", "applications", "leases", "maintenance", "messages", "payments"].sort(),
    );
  });
});
